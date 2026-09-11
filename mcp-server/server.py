"""Harvest & Co. — AI Commerce Search を MCP ツールとして公開するサーバー。

CX Agent Studio (CES) のエージェントが、この EC サイトのカタログを
Vertex AI Search for Commerce (Retail API) 経由で検索できるようにします。

構成:
    CES エージェント ──MCP(streamable HTTP)──> このサーバー ──> Retail API

参考: https://github.com/shrishmarnad/VertexcommerceMCP
      CES 互換のためのモンキーパッチはそちらの実装を踏襲しています。

このサイト向けに変えている点:
  - Retail の検索レスポンスは既定で商品名すら返しません (カタログの
    attributesConfig が全フィールド RETRIEVABLE_DISABLED のため)。
    共有カタログの設定は変更せず、検索でヒットしたIDに対して
    products.get を並列に投げて商品情報を組み立てます。
  - エージェントは product_list / product-detail ウィジェットに
    imageUris と uri を要求するので、画像URLとサイトの商品ページURLを返します。
  - クエリ拡張は AUTO + pinUnexpandedResults。完全一致を先頭に固定したまま
    関連商品で件数を補います (DISABLED だと実質タイトル一致しか返らない)。
  - recently_viewed 系のレコメンドはユーザーイベントを送っていないと常に空を
    返すため、ツールとしては公開していません。
  - fetch_recipe_ingredients はレシピページを取得して材料を抜き出します。
    ユーザーが指定した URL をそのまま取りに行くツールなので、SSRF 対策として
    宛先IPを検証しています (_validate_public_url を参照)。

環境変数:
    PROJECT_NUMBER    : Google Cloud のプロジェクト番号 (プロジェクトIDではない)
    CATALOG_LOCATION  : カタログのロケーション (既定: global)
    CATALOG_ID        : カタログID (既定: default_catalog)
    SERVING_CONFIG_ID : サービング構成ID (既定: default_search)
    BRANCH_ID         : 検索対象ブランチ (既定: default_branch)
    SITE_BASE_URL     : 商品ページURLの組み立てに使うサイトのベースURL
    QUERY_EXPANSION   : AUTO / DISABLED (既定: AUTO)
"""

import asyncio
import html
import inspect
import ipaddress
import json
import os
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from google.api_core.exceptions import GoogleAPICallError, NotFound
from google.cloud import retail_v2
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import FastMCP as _FastMCP
from mcp.server.streamable_http import StreamableHTTPServerTransport
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Tool as MCPTool

# ---------------------------------------------------------------------------
# CES (Agent Studio) 互換のためのモンキーパッチ
# ---------------------------------------------------------------------------
# 1. CES は Accept ヘッダーを MCP 仕様どおりに送ってこないので検証を緩める


def _loose_check_accept_headers(self, request):
    return True, True


StreamableHTTPServerTransport._check_accept_headers = _loose_check_accept_headers


# 2. CES のツール定義パーサーは厳格なので、name/description/inputSchema だけの
#    最小形にして、title や default といった余計なキーを落とす
def _clean_schema(schema):
    if not isinstance(schema, dict):
        return schema
    schema.pop("title", None)
    schema.pop("default", None)
    for value in list(schema.values()):
        if isinstance(value, dict):
            _clean_schema(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _clean_schema(item)
    return schema


async def _list_tools_minimal(self) -> list[MCPTool]:
    return [
        MCPTool(
            name=info.name,
            description=inspect.cleandoc(info.description) if info.description else "",
            inputSchema=_clean_schema(dict(info.parameters)),
        )
        for info in self._tool_manager.list_tools()
    ]


_FastMCP.list_tools = _list_tools_minimal

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

PROJECT_NUMBER = os.getenv("PROJECT_NUMBER", "")
CATALOG_LOCATION = os.getenv("CATALOG_LOCATION", "global")
CATALOG_ID = os.getenv("CATALOG_ID", "default_catalog")
SERVING_CONFIG_ID = os.getenv("SERVING_CONFIG_ID", "default_search")
BRANCH_ID = os.getenv("BRANCH_ID", "default_branch")
SITE_BASE_URL = os.getenv("SITE_BASE_URL", "").rstrip("/")
QUERY_EXPANSION = "DISABLED" if os.getenv("QUERY_EXPANSION") == "DISABLED" else "AUTO"

MAX_PAGE_SIZE = 20

CATALOG = f"projects/{PROJECT_NUMBER}/locations/{CATALOG_LOCATION}/catalogs/{CATALOG_ID}"
PLACEMENT = f"{CATALOG}/servingConfigs/{SERVING_CONFIG_ID}"
BRANCH = f"{CATALOG}/branches/{BRANCH_ID}"

# サイト側のカテゴリスラッグ ⇔ カタログのカテゴリ名。
# エージェントはどちらで渡してくるか分からないので両方受ける。
CATEGORY_TO_RETAIL = {
    "vegetables": "野菜",
    "fruits": "果物",
    "meat": "精肉",
    "seafood": "鮮魚",
    "dairy": "乳製品",
    "bakery": "パン",
    "beverages": "飲料",
    "pantry": "調味料",
}

mcp = FastMCP(
    "HarvestCommerceMCP",
    stateless_http=True,  # CES はリクエストごとに独立して呼んでくる
    json_response=True,   # SSE ではなく JSON で返す
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)

_search_client: retail_v2.SearchServiceAsyncClient | None = None
_product_client: retail_v2.ProductServiceAsyncClient | None = None


def _clients():
    global _search_client, _product_client
    if _search_client is None:
        _search_client = retail_v2.SearchServiceAsyncClient()
    if _product_client is None:
        _product_client = retail_v2.ProductServiceAsyncClient()
    return _search_client, _product_client


# ---------------------------------------------------------------------------
# 変換
# ---------------------------------------------------------------------------


def _quote(value: str) -> str:
    return '"' + value.replace('"', '\\"') + '"'


def _build_filter(category: str) -> str:
    """カテゴリ指定を Retail の filter 式にする。未知の値は無視する。"""
    if not category:
        return ""
    name = CATEGORY_TO_RETAIL.get(category.strip().lower(), category.strip())
    if name not in CATEGORY_TO_RETAIL.values():
        return ""
    return f"categories: ANY({_quote(name)})"


def _product_to_dict(product) -> dict:
    """Retail の Product を、エージェントのウィジェットに渡せる形に整える。"""
    price_info = product.price_info
    images = [image.uri for image in product.images if image.uri]
    categories = list(product.categories)

    item = {
        "productId": product.id,
        "title": product.title,
        # ウィジェットの subtitle はカテゴリを出すのが自然
        "subtitle": categories[0] if categories else "",
        "description": product.description,
        "categories": categories,
        # ウィジェットの price は文字列。小数は付けない
        "price": f"{price_info.price:g}" if price_info.price else "",
        "currency": price_info.currency_code or "JPY",
        "imageUris": images,
        "availability": product.availability.name if product.availability else "",
    }
    # 商品詳細ページURL。エージェントはこれをウィジェットの uri に入れる
    if SITE_BASE_URL and product.id:
        item["uri"] = f"{SITE_BASE_URL}/product.html?id={product.id}"
    if product.rating and product.rating.average_rating:
        item["rating"] = round(product.rating.average_rating, 1)
        item["ratingCount"] = product.rating.rating_count
    return item


async def _fetch_products(product_client, ids: list[str]) -> dict[str, dict]:
    """検索でヒットしたIDの商品情報をまとめて取得する。

    Retail の検索レスポンスは attributesConfig が RETRIEVABLE_ENABLED でない限り
    商品名すら含まないため、ここで products.get を並列に投げて補う。
    """

    async def one(product_id: str):
        try:
            product = await product_client.get_product(name=f"{BRANCH}/products/{product_id}")
            return product_id, _product_to_dict(product)
        except (NotFound, GoogleAPICallError):
            # 1件取れなくても検索結果全体は返す
            return product_id, None

    pairs = await asyncio.gather(*(one(i) for i in ids))
    return {pid: item for pid, item in pairs if item}


# ---------------------------------------------------------------------------
# レシピページの読み取り
# ---------------------------------------------------------------------------

RECIPE_TIMEOUT = 10.0
RECIPE_MAX_BYTES = 2 * 1024 * 1024
RECIPE_MAX_REDIRECTS = 5
RECIPE_MAX_INGREDIENTS = 40
RECIPE_TEXT_LIMIT = 4000
RECIPE_USER_AGENT = "HarvestCommerceMCP/1.0 (recipe ingredient reader)"

_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
              "link", "meta", "param", "source", "track", "wbr"}


class UrlNotAllowed(ValueError):
    """取得を許可しない URL。メッセージはそのままエージェントに返す。"""


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _assert_public_url(url: str) -> None:
    """SSRF 対策。外部の公開ホスト宛であることを確認する。

    このツールはユーザーが渡した URL をサーバー側から取りに行くので、そのままだと
    メタデータサーバー (169.254.169.254) や VPC 内部のサービスを読み出せてしまう。
    名前解決した IP がすべてグローバルなときだけ通す。リダイレクト先も毎回通す。
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UrlNotAllowed("http / https の URL だけを開けます。")
    host = parsed.hostname
    if not host:
        raise UrlNotAllowed("URL にホスト名が含まれていません。")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, ValueError):
        raise UrlNotAllowed(f"ホスト名を解決できませんでした: {host}") from None
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise UrlNotAllowed(f"内部ネットワーク宛の URL は開けません: {host}")


async def _fetch_html(url: str) -> tuple[str, str]:
    """レシピページの HTML を取得する。戻り値は (最終URL, HTML)。

    リダイレクトは httpx に任せず自前で追う。追随先が内部アドレスに向いていないか
    1 ホップずつ _assert_public_url で確かめるため。
    """
    headers = {
        "User-Agent": RECIPE_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8",
    }
    current = url
    async with httpx.AsyncClient(follow_redirects=False, timeout=RECIPE_TIMEOUT) as client:
        for _ in range(RECIPE_MAX_REDIRECTS + 1):
            _assert_public_url(current)
            async with client.stream("GET", current, headers=headers) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise UrlNotAllowed("リダイレクト先が示されていません。")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    raise UrlNotAllowed(
                        f"ページを取得できませんでした (HTTP {response.status_code})。"
                    )
                content_type = response.headers.get("content-type", "").lower()
                if content_type and not any(
                    kind in content_type
                    for kind in ("text/html", "application/xhtml", "text/plain")
                ):
                    raise UrlNotAllowed(
                        f"HTML ではないので読み取れません ({content_type.split(';')[0]})。"
                    )
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= RECIPE_MAX_BYTES:
                        break
                encoding = response.encoding or "utf-8"
            body = b"".join(chunks)[:RECIPE_MAX_BYTES]
            return current, body.decode(encoding, errors="replace")
    raise UrlNotAllowed("リダイレクトが多すぎます。")


def _is_ingredient_prop(attributes: dict) -> bool:
    prop = attributes.get("itemprop", "").strip().lower()
    return prop in ("recipeingredient", "ingredients")


class _RecipeHTMLParser(HTMLParser):
    """JSON-LD ブロック・itemprop の材料・本文テキストをまとめて拾う。

    beautifulsoup4 を足さずに済ませたいので標準の HTMLParser で処理している。
    """

    _SKIP_TAGS = {"script", "style", "noscript", "template", "svg"}
    _BREAK_TAGS = {"p", "br", "li", "tr", "td", "th", "div", "section",
                   "h1", "h2", "h3", "h4", "h5", "h6"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.jsonld_blocks: list[str] = []
        self.microdata_ingredients: list[str] = []
        self.title = ""
        self._text: list[str] = []
        self._skip_tag = ""
        self._jsonld: list[str] | None = None
        self._in_title = False
        self._ingredient: list[str] | None = None
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if self._skip_tag:
            return
        attributes = {key.lower(): (value or "") for key, value in attrs}
        void = tag in _VOID_TAGS

        if _is_ingredient_prop(attributes):
            # <meta itemprop="recipeIngredient" content="..."> は content に入っている
            content = _collapse(attributes.get("content", ""))
            if content:
                self.microdata_ingredients.append(content)
            elif self._ingredient is None and not void:
                self._ingredient = []
                self._depth = 1
        elif self._ingredient is not None and not void:
            self._depth += 1

        if tag == "title":
            self._in_title = True
        elif tag in self._SKIP_TAGS:
            if tag == "script" and "ld+json" in attributes.get("type", "").lower():
                self._jsonld = []
            self._skip_tag = tag
        elif tag in self._BREAK_TAGS:
            self._text.append("\n")

    def handle_endtag(self, tag):
        if self._skip_tag:
            if tag == self._skip_tag:
                if self._jsonld is not None:
                    self.jsonld_blocks.append("".join(self._jsonld))
                    self._jsonld = None
                self._skip_tag = ""
            return
        if tag == "title":
            self._in_title = False
        if self._ingredient is not None and tag not in _VOID_TAGS:
            self._depth -= 1
            if self._depth <= 0:
                value = _collapse("".join(self._ingredient))
                if value:
                    self.microdata_ingredients.append(value)
                self._ingredient = None
        if tag in self._BREAK_TAGS:
            self._text.append("\n")

    def handle_data(self, data):
        if self._jsonld is not None:
            self._jsonld.append(data)
            return
        if self._skip_tag:
            return
        if self._in_title:
            self.title += data
        if self._ingredient is not None:
            self._ingredient.append(data)
        self._text.append(data)

    @property
    def text(self) -> str:
        lines = (_collapse(line) for line in "".join(self._text).splitlines())
        return "\n".join(line for line in lines if line)


def _iter_jsonld_nodes(value):
    """JSON-LD は配列や @graph で入れ子になっているので再帰的にたどる。"""
    if isinstance(value, list):
        for item in value:
            yield from _iter_jsonld_nodes(item)
    elif isinstance(value, dict):
        yield value
        for key in ("@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"):
            if key in value:
                yield from _iter_jsonld_nodes(value[key])


def _is_recipe_node(node: dict) -> bool:
    types = node.get("@type", "")
    types = types if isinstance(types, list) else [types]
    return any(str(kind).lower().endswith("recipe") for kind in types)


def _jsonld_ingredients(blocks: list[str]) -> tuple[list[str], str]:
    """schema.org/Recipe の recipeIngredient を探す。戻り値は (材料, レシピ名)。"""
    for block in blocks:
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for node in _iter_jsonld_nodes(data):
            if not _is_recipe_node(node):
                continue
            raw = node.get("recipeIngredient") or node.get("ingredients") or []
            if isinstance(raw, str):
                raw = [raw]
            items = [_collapse(html.unescape(str(item))) for item in raw]
            items = [item for item in items if item]
            if items:
                return items, _collapse(html.unescape(str(node.get("name") or "")))
    return [], ""


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    return [v for v in values if not (v in seen or seen.add(v))]


# ---------------------------------------------------------------------------
# MCP ツール
# ---------------------------------------------------------------------------


@mcp.tool()
async def search_products(query: str, page_size: int = 8, category: str = "") -> str:
    """Harvest & Co. の商品カタログを自然文で検索します。

    「トマトを探して」「朝食向けのパン」のような商品探しに使ってください。
    結果は JSON で、各商品に productId / title / subtitle / price / imageUris /
    uri が入っています。商品一覧を見せるときは、この値をそのまま
    product_list ウィジェットに渡してください。

    Args:
        query: 検索キーワード。ユーザーの言葉のままで構いません。
        page_size: 返す件数 (1〜20)。既定は 8 件。
        category: 絞り込むカテゴリ。野菜 / 果物 / 精肉 / 鮮魚 / 乳製品 / パン /
            飲料 / 調味料 のいずれか。指定しなければ全カテゴリを検索します。
    """
    if not query or not query.strip():
        return json.dumps({"error": "検索キーワードが空です。"}, ensure_ascii=False)

    search_client, product_client = _clients()
    size = max(1, min(int(page_size or 8), MAX_PAGE_SIZE))

    request = retail_v2.SearchRequest(
        placement=PLACEMENT,
        query=query.strip(),
        page_size=size,
        filter=_build_filter(category),
        visitor_id="ces-agent",
        query_expansion_spec=retail_v2.SearchRequest.QueryExpansionSpec(
            condition=retail_v2.SearchRequest.QueryExpansionSpec.Condition[QUERY_EXPANSION],
            pin_unexpanded_results=True,
        ),
    )

    try:
        response = await search_client.search(request=request)
    except GoogleAPICallError as error:
        return json.dumps({"error": f"検索に失敗しました: {error.message}"}, ensure_ascii=False)

    page = response.raw_page if hasattr(response, "raw_page") else response
    ids = [result.id for result in page.results]
    if not ids:
        return json.dumps(
            {"query": query, "totalSize": 0, "products": [],
             "note": "該当する商品が見つかりませんでした。"},
            ensure_ascii=False,
        )

    detail_by_id = await _fetch_products(product_client, ids)
    expansion = page.query_expansion_info
    pinned = int(expansion.pinned_result_count or 0)

    products = []
    for index, product_id in enumerate(ids):
        item = detail_by_id.get(product_id)
        if not item:
            continue
        # 先頭 pinned 件が完全一致。それ以降はクエリ拡張で補われた関連商品。
        item["exactMatch"] = index < pinned if expansion.expanded_query else True
        products.append(item)

    return json.dumps(
        {
            "query": query,
            "correctedQuery": page.corrected_query or "",
            "totalSize": int(page.total_size or 0),
            "expanded": bool(expansion.expanded_query),
            "products": products,
        },
        ensure_ascii=False,
    )


@mcp.tool()
async def get_product_details(product_id: str) -> str:
    """商品IDを指定して、1件の商品の詳細を取得します。

    価格・在庫・評価・説明文が必要なとき、また product-detail ウィジェットに
    渡す値をそろえるときに使ってください。商品IDは search_products の結果に
    含まれる productId です。

    Args:
        product_id: 商品ID (例: "1")。
    """
    if not product_id or not str(product_id).strip():
        return json.dumps({"error": "商品IDが空です。"}, ensure_ascii=False)

    _, product_client = _clients()
    try:
        product = await product_client.get_product(
            name=f"{BRANCH}/products/{str(product_id).strip()}"
        )
    except NotFound:
        return json.dumps(
            {"error": f"商品ID {product_id} は見つかりませんでした。"}, ensure_ascii=False
        )
    except GoogleAPICallError as error:
        return json.dumps({"error": f"取得に失敗しました: {error.message}"}, ensure_ascii=False)

    item = _product_to_dict(product)
    # 産地や内容量など、カタログ独自の属性も渡す
    attributes = {}
    for key, value in product.attributes.items():
        values = list(value.text) or [str(number) for number in value.numbers]
        if values:
            attributes[key] = values[0] if len(values) == 1 else values
    if attributes:
        item["attributes"] = attributes
    return json.dumps(item, ensure_ascii=False)


@mcp.tool()
async def fetch_recipe_ingredients(url: str) -> str:
    """レシピページの URL を開いて、そこに書かれている材料を読み取ります。

    ユーザーがレシピサイトの URL を示したときに使ってください。結果は JSON で、
    ingredients に材料が 1 つずつ配列で入ります。構造化データが無いページでは
    ingredients が空になり、代わりに pageText にページ本文の抜粋が入るので、
    そこから材料を読み取ってください。

    Args:
        url: レシピページの URL (http または https)。
    """
    if not url or not str(url).strip():
        return json.dumps({"error": "URL が空です。"}, ensure_ascii=False)

    target = str(url).strip()
    if "://" not in target:
        target = "https://" + target

    try:
        final_url, body = await _fetch_html(target)
    except UrlNotAllowed as error:
        return json.dumps({"error": str(error)}, ensure_ascii=False)
    except httpx.HTTPError as error:
        return json.dumps(
            {"error": f"ページを取得できませんでした ({type(error).__name__})。"},
            ensure_ascii=False,
        )

    parser = _RecipeHTMLParser()
    parser.feed(body)
    parser.close()

    ingredients, recipe_name = _jsonld_ingredients(parser.jsonld_blocks)
    source = "jsonld"
    if not ingredients:
        ingredients = _dedupe(parser.microdata_ingredients)
        source = "microdata"

    result = {
        "url": final_url,
        "title": _collapse(parser.title),
        "recipeName": recipe_name,
        "source": source if ingredients else "pageText",
        "ingredients": ingredients[:RECIPE_MAX_INGREDIENTS],
    }
    if not ingredients:
        result["note"] = (
            "材料の構造化データが見つかりませんでした。pageText から材料を読み取ってください。"
        )
        result["pageText"] = parser.text[:RECIPE_TEXT_LIMIT]
    return json.dumps(result, ensure_ascii=False)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        mcp.streamable_http_app(),
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8080)),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
