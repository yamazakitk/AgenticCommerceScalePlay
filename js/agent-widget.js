// CX Agent Studio (Gemini Enterprise for Customer Experience / CES) 連携
//
// CX Agent Studio で構築したエージェントを、サイト右端のチャットパネルとして
// 埋め込みます。Dialogflow CX の df-messenger とは別系統の API なので、
// ウィジェットもここで自前に実装しています。
//
// 通信の流れ (すべてブラウザから直接、プロキシ不要):
//   1. POST {session}:generateChatToken   … 認証なしで呼べる。セッション専用の
//      短命 JWT (約1時間) が返る。deployment 側で「公開アクセス」を有効にし、
//      許可オリジンにこのサイトを登録しておく必要がある。
//   2. POST {session}:streamRunSession    … 1 で得たトークンを Bearer に載せて
//      発話を送る。応答は JSON 配列がチャンク分割で流れてくる。
//   会話履歴はセッション名でサーバー側に保持されるため、履歴の送り直しは不要。
//
// deployment 側の設定 (gcloud/REST で作成済み):
//   channelProfile.channelType = WEB_UI
//   webWidgetConfig.securitySettings.enablePublicAccess = true
//   webWidgetConfig.securitySettings.enableOriginCheck  = true
//   webWidgetConfig.securitySettings.allowedOrigins     = [このサイトのオリジン]
//   → 新しいオリジン (独自ドメイン等) を足すときは allowedOrigins も更新すること。
//
// 接続先 (projectId / location / appId / deploymentId) は js/config.js の
// window.AGENT_STUDIO_CONFIG で設定します。appId が "YOUR_" で始まるデフォルト値の
// ままの場合、ウィジェットは読み込まれません (サイトは通常どおり動作します)。

(function () {
  // 表示まわりの文言はここが既定値。js/config.js で上書きできる。
  const cfg = Object.assign({
    location: "us",
    deploymentId: "web-widget",
    apiHost: "https://ces.googleapis.com",
    chatTitle: "Harvest & Co. お買い物アシスタント",
    subtitle: "商品選びのご相談をどうぞ",
    greeting: "こんにちは！Harvest & Co. のお買い物アシスタントです。お探しの食材やご予算をお聞かせください。"
  }, window.AGENT_STUDIO_CONFIG || {});

  const isConfigured = !!(cfg.projectId && !cfg.projectId.startsWith("YOUR_") &&
    cfg.appId && !cfg.appId.startsWith("YOUR_"));

  if (!isConfigured) {
    console.info("[Harvest & Co.] CX Agent Studio 未設定のため、エージェントウィジェットは無効です。(js/config.js)");
    return;
  }

  const APP = `projects/${cfg.projectId}/locations/${cfg.location}/apps/${cfg.appId}`;
  const DEPLOYMENT = `${APP}/deployments/${cfg.deploymentId}`;
  const SESSION_KEY = "harvest_agent_session";
  const HISTORY_KEY = "harvest_agent_history";

  // ==========================================================================
  // SESSION / TOKEN
  // ==========================================================================
  // セッションIDはページ遷移をまたいで維持する (商品ページ→カートでも会話が続く)。
  // トークンはセッション名に紐づくので、セッションを作り直したら必ず取り直す。

  let chatToken = null;
  let chatTokenExpiry = 0;

  function sessionName() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
        .replace(/-/g, "").slice(0, 32);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return `${APP}/sessions/${id}`;
  }

  async function getChatToken(forceRefresh) {
    // 有効期限の 60 秒前には取り直す (送信中に切れると 401 になるため)
    if (!forceRefresh && chatToken && Date.now() < chatTokenExpiry - 60000) return chatToken;

    const res = await fetch(`${cfg.apiHost}/v1beta/${sessionName()}:generateChatToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployment: DEPLOYMENT })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.chatToken) {
      const message = (data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(`チャットトークンを取得できませんでした: ${message}`);
    }
    chatToken = data.chatToken;
    chatTokenExpiry = Date.parse(data.expireTime) || (Date.now() + 30 * 60000);
    return chatToken;
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================
  // streamRunSession は「JSON 配列を少しずつ流す」形式で返ってくる
  // (`[{...}` → `,\n{...}` → `]`)。文字列リテラルを考慮しつつ波かっこの
  // 深さを数えて、完成したトップレベル要素から順に取り出す。

  function makeJsonArrayScanner(onValue) {
    let buf = "";
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    return function push(chunk) {
      buf += chunk;
      for (let i = buf.length - chunk.length; i < buf.length; i++) {
        const ch = buf[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") { if (depth === 0) start = i; depth++; continue; }
        if (ch === "}") {
          depth--;
          if (depth === 0 && start >= 0) {
            const text = buf.slice(start, i + 1);
            start = -1;
            try { onValue(JSON.parse(text)); } catch (_) { /* 途中で壊れた要素は無視 */ }
          }
        }
      }
      // 完成済みの部分は捨ててバッファが膨らまないようにする
      if (depth === 0) buf = "";
    };
  }

  async function sendToAgent(text, handlers) {
    const session = sessionName();
    const body = JSON.stringify({
      config: {
        session,
        deployment: DEPLOYMENT,
        enableTextStreaming: true,
        excludeDiagnosticInfo: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      inputs: [{ text }]
    });

    const call = async (token) => fetch(`${cfg.apiHost}/v1beta/${session}:streamRunSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body
    });

    let res = await call(await getChatToken());
    // トークン失効時は 1 度だけ取り直して再送する
    if (res.status === 401 || res.status === 403) res = await call(await getChatToken(true));

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err.error && err.error.message) || `HTTP ${res.status}`);
    }

    const scan = makeJsonArrayScanner((value) => {
      (value.outputs || []).forEach((out) => handlers.onOutput(out));
    });

    // ストリーム非対応の環境では一括で読む
    if (!res.body || !res.body.getReader) {
      scan(await res.text());
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      scan(decoder.decode(value, { stream: true }));
    }
  }

  // ==========================================================================
  // UI
  // ==========================================================================

  const STYLES = `
    #harvest-agent-launcher {
      position: fixed; right: 24px; bottom: 24px; z-index: 1200;
      width: 60px; height: 60px; border: none; border-radius: var(--radius-full, 9999px);
      background: var(--primary-color, #1A3A2B); color: #FFFFFF; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-lg, 0 16px 32px rgba(26, 58, 43, 0.08));
      transition: transform var(--transition-fast, 0.15s) ease, background var(--transition-fast, 0.15s) ease;
    }
    #harvest-agent-launcher:hover { background: var(--primary-hover, #11281D); transform: translateY(-2px); }
    #harvest-agent-launcher svg { width: 26px; height: 26px; }
    #harvest-agent-launcher[hidden] { display: none; }

    #harvest-agent-panel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 1201;
      width: 380px; max-width: 100vw;
      display: flex; flex-direction: column;
      background: var(--bg-page, #FAFAF7);
      border-left: 1px solid var(--border-color, #EAEAE3);
      box-shadow: var(--shadow-lg, 0 16px 32px rgba(26, 58, 43, 0.08));
      font-family: var(--font-body, 'DM Sans', sans-serif);
      color: var(--text-primary, #2A2E2B);
      transform: translateX(100%);
      transition: transform var(--transition-normal, 0.3s) ease;
    }
    #harvest-agent-panel.is-open { transform: translateX(0); }

    .harvest-agent-header {
      display: flex; align-items: center; gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      background: var(--primary-color, #1A3A2B); color: #FFFFFF;
    }
    .harvest-agent-header h2 {
      margin: 0; font-family: var(--font-header, 'Outfit', sans-serif);
      font-size: 1rem; font-weight: 600; line-height: 1.3;
    }
    .harvest-agent-header p { margin: 2px 0 0; font-size: 0.75rem; opacity: 0.75; }
    .harvest-agent-actions {
      margin-left: auto; display: flex; align-items: center; gap: var(--space-xs, 4px);
    }
    .harvest-agent-header .harvest-agent-close,
    .harvest-agent-header .harvest-agent-clear {
      background: none; border: none; color: #FFFFFF;
      line-height: 1; cursor: pointer; padding: 0 var(--space-xs, 4px); opacity: 0.8;
    }
    .harvest-agent-header .harvest-agent-close { font-size: 1.5rem; }
    .harvest-agent-header .harvest-agent-clear {
      display: flex; align-items: center; padding: var(--space-xs, 4px);
      border-radius: var(--radius-sm, 6px);
    }
    .harvest-agent-header .harvest-agent-clear svg { width: 18px; height: 18px; display: block; }
    .harvest-agent-header .harvest-agent-close:hover { opacity: 1; }
    .harvest-agent-header .harvest-agent-clear:hover:not(:disabled) {
      opacity: 1; background: rgba(255, 255, 255, 0.15);
    }
    .harvest-agent-header .harvest-agent-clear:disabled { opacity: 0.35; cursor: default; }

    .harvest-agent-log {
      flex: 1; overflow-y: auto; padding: var(--space-lg, 24px);
      display: flex; flex-direction: column; gap: var(--space-md, 16px);
    }
    .harvest-agent-msg {
      max-width: 85%; padding: 10px 14px; border-radius: var(--radius-lg, 16px);
      font-size: 0.875rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
    }
    .harvest-agent-msg.agent {
      align-self: flex-start; background: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #EAEAE3); border-bottom-left-radius: var(--radius-sm, 4px);
    }
    .harvest-agent-msg.user {
      align-self: flex-end; background: var(--primary-color, #1A3A2B); color: #FFFFFF;
      border-bottom-right-radius: var(--radius-sm, 4px);
    }
    .harvest-agent-msg.error {
      align-self: stretch; background: #FDECEA; color: var(--error, #C62828);
      border: 1px solid #F5C6C2; font-size: 0.8125rem;
    }
    .harvest-agent-msg a { color: inherit; text-decoration: underline; }
    .harvest-agent-msg.agent a { color: var(--primary-color, #1A3A2B); }

    .harvest-agent-msg.has-widget { max-width: 100%; align-self: stretch; }
    .harvest-agent-cards {
      display: flex; flex-direction: column; gap: var(--space-sm, 8px);
      margin-top: var(--space-sm, 8px);
    }
    .harvest-agent-cards:first-child { margin-top: 0; }
    .harvest-agent-card {
      display: flex; gap: 12px; align-items: center; padding: 8px;
      border: 1px solid var(--border-color, #EAEAE3); border-radius: var(--radius-md, 8px);
      background: var(--bg-page, #FAFAF7); color: inherit; text-decoration: none;
    }
    a.harvest-agent-card:hover { border-color: var(--accent-color, #D4A373); }
    .harvest-agent-card img {
      flex: 0 0 auto; width: 56px; height: 56px; object-fit: contain;
      border-radius: var(--radius-sm, 4px); background: var(--bg-input, #F3F3ED);
    }
    .harvest-agent-card-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .harvest-agent-card-title { font-size: 0.8125rem; font-weight: 500; line-height: 1.35; }
    .harvest-agent-card-sub { font-size: 0.75rem; color: var(--text-secondary, #5C625E); }
    .harvest-agent-card-price { font-size: 0.8125rem; font-weight: 600; color: var(--primary-color, #1A3A2B); }

    .harvest-agent-status {
      align-self: flex-start; font-size: 0.75rem;
      color: var(--text-secondary, #5C625E); font-style: italic;
    }
    .harvest-agent-status[hidden] { display: none; }

    .harvest-agent-form {
      display: flex; gap: var(--space-sm, 8px); padding: var(--space-md, 16px);
      border-top: 1px solid var(--border-color, #EAEAE3); background: var(--bg-card, #FFFFFF);
    }
    .harvest-agent-form textarea {
      flex: 1; resize: none; max-height: 120px;
      padding: 10px 14px; font: inherit; font-size: 0.875rem;
      border: 1px solid var(--border-color, #EAEAE3); border-radius: var(--radius-md, 8px);
      background: var(--bg-input, #F3F3ED); color: inherit;
    }
    .harvest-agent-form textarea:focus {
      outline: none; border-color: var(--accent-color, #D4A373); background: var(--bg-card, #FFFFFF);
    }
    .harvest-agent-form button {
      flex: 0 0 auto; padding: 0 var(--space-md, 16px);
      border: none; border-radius: var(--radius-md, 8px);
      background: var(--primary-color, #1A3A2B); color: #FFFFFF;
      font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer;
    }
    .harvest-agent-form button:disabled { opacity: 0.45; cursor: default; }

    @media (max-width: 480px) {
      #harvest-agent-panel { width: 100vw; border-left: none; }
      #harvest-agent-launcher { right: 16px; bottom: 16px; }
    }
  `;

  const ADD_TO_CART_HASH = /#add-to-cart-(\d+)$/;

  let panel, log, statusEl, textarea, sendButton, clearButton, launcher;
  let busy = false;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // エージェントは Markdown 混じりで返してくる。リンク・強調・箇条書きの
  // 記号だけを最低限整えて、それ以外はプレーンテキストとして扱う。
  function renderMarkdown(text) {
    return escapeHtml(text)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/^[ \t]*[*-][ \t]+/gm, "・");
  }

  // ==========================================================================
  // ウィジェット記法
  // ==========================================================================
  // CES のエージェントは商品カルーセルなどを、本文テキストの中に
  //   [widget:product_list]
  //   { "productDetails": [ ... ] }
  // という記法で埋め込んで返してくる (CES 公式ウィジェットが描画する前提)。
  // そのまま出すと生 JSON が見えてしまうので、切り出してカードとして描く。

  const WIDGET_MARKER = /\[widget:([A-Za-z0-9_-]+)\]\s*/;

  // text[from] から始まる JSON オブジェクトの終端を返す (文字列リテラルを考慮)
  function findJsonEnd(text, from) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = from; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return i + 1;
    }
    return -1; // ストリーミング途中で未完成
  }

  function splitWidgets(text) {
    const widgets = [];
    let body = "";
    let rest = String(text);

    for (;;) {
      const match = WIDGET_MARKER.exec(rest);
      if (!match) { body += rest; break; }
      body += rest.slice(0, match.index);

      const jsonStart = match.index + match[0].length;
      // 記法の直後が JSON でなければ、マーカーだけ落として本文として続ける
      if (rest[jsonStart] !== "{") { rest = rest.slice(jsonStart); continue; }

      const jsonEnd = findJsonEnd(rest, jsonStart);
      // 未完成 (受信途中) なら、その手前までを本文として扱い残りは捨てる
      if (jsonEnd < 0) break;

      try {
        widgets.push({ name: match[1], data: JSON.parse(rest.slice(jsonStart, jsonEnd)) });
      } catch (_) { /* 壊れた JSON は無視 */ }
      rest = rest.slice(jsonEnd);
    }
    return { body: body.trim(), widgets };
  }

  function formatPrice(value) {
    const num = Number(value);
    if (!isFinite(num) || !num) return "";
    return `¥${Math.round(num).toLocaleString("ja-JP")}`;
  }

  // エージェントのカタログとサイトのカタログは別物なので、商品IDが
  // このサイトに存在するときだけ商品ページへリンクする。
  function siteProductUrl(productId) {
    const id = Number(productId);
    if (!id || !Array.isArray(window.products)) return "";
    return window.products.some((p) => Number(p.id) === id) ? `product.html?id=${id}` : "";
  }

  // MCP サーバーは絶対URLの uri を返してくる。エージェントの出力をそのまま
  // リンクにすると外部サイトへ誘導されうるので、同一オリジンのものだけ通す。
  function sameOriginUrl(uri) {
    if (typeof uri !== "string" || !/^https?:/i.test(uri)) return "";
    try {
      const url = new URL(uri, location.href);
      return url.origin === location.origin ? url.pathname.replace(/^\//, "") + url.search : "";
    } catch (error) {
      return "";
    }
  }

  function buildCard(item) {
    const href = siteProductUrl(item.productId) || sameOriginUrl(item.uri);
    const card = document.createElement(href ? "a" : "div");
    card.className = "harvest-agent-card";
    if (href) card.href = href;

    const image = Array.isArray(item.imageUris) ? item.imageUris.find((u) => /^https?:/.test(u)) : "";
    const price = formatPrice(item.price);
    card.innerHTML = `
      ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
      <div class="harvest-agent-card-body">
        <span class="harvest-agent-card-title">${escapeHtml(item.title || "")}</span>
        ${item.subtitle ? `<span class="harvest-agent-card-sub">${escapeHtml(item.subtitle)}</span>` : ""}
        ${price ? `<span class="harvest-agent-card-price">${price}</span>` : ""}
      </div>`;
    return card;
  }

  function renderWidget(widget) {
    // product_list は productDetails の配列、product-detail は単体。
    // compare_products など未対応のものは黙って捨てる (生 JSON を出すよりまし)。
    const data = widget.data || {};
    const items = Array.isArray(data.productDetails) ? data.productDetails
      : data.title ? [data]
      : [];
    if (!items.length) return null;

    const wrap = document.createElement("div");
    wrap.className = "harvest-agent-cards";
    items.forEach((item) => wrap.appendChild(buildCard(item)));
    return wrap;
  }

  // CES はウィジェットをテキスト中の [widget:...] 記法で返すこともあれば、
  // 構造化された payload (type: product_detail_carousel など) で返すこともある。
  // どちらで来ても同じカードになるよう、payload 側もここで拾う。
  // product_list / compare_products は productDetails の配列、
  // product-detail は商品1件がそのまま payload 直下に入る (type: base_product_detail)。
  function isWidgetData(value) {
    if (!value || typeof value !== "object") return false;
    return Array.isArray(value.productDetails) || Boolean(value.productId && value.title);
  }

  function payloadWidget(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (isWidgetData(payload)) return { name: payload.type || "payload", data: payload };
    // 一段ネストされて届くことがあるので、直下だけ探す
    for (const value of Object.values(payload)) {
      if (isWidgetData(value)) return { name: payload.type || "payload", data: value };
    }
    return null;
  }

  // streaming = true のときはテキスト側のウィジェットを描かない (JSON がまだ完成していない)
  function setMessageContent(el, text, streaming, widgets) {
    const parsed = splitWidgets(text);
    el.innerHTML = renderMarkdown(parsed.body);
    if (streaming) return;
    const all = parsed.widgets.concat(widgets || []);
    const cards = all.map(renderWidget).filter(Boolean);
    cards.forEach((c) => el.appendChild(c));
    el.classList.toggle("has-widget", cards.length > 0);
  }

  function appendMessage(role, text, streaming, widgets) {
    const el = document.createElement("div");
    el.className = `harvest-agent-msg ${role}`;
    setMessageContent(el, text, streaming, widgets);
    log.insertBefore(el, statusEl);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
    statusEl.hidden = !text;
    if (text) scrollToBottom();
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    textarea.disabled = value;
    clearButton.disabled = value;
  }

  // 会話の見た目もページ遷移をまたいで復元する (サーバー側の文脈は残っているので、
  // 復元しないと「続きから話しているのに画面は空」というズレが出る)
  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(entries) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-40)));
    } catch (_) { /* 容量超過などは黙って諦める */ }
  }

  function recordHistory(role, text, widgets) {
    const entries = loadHistory();
    entries.push(widgets && widgets.length ? { role, text, widgets } : { role, text });
    saveHistory(entries);
  }

  function showGreeting() {
    if (!cfg.greeting) return;
    // 挨拶も履歴に含める。含めないとページ遷移のたびに消えてしまう。
    appendMessage("agent", cfg.greeting);
    recordHistory("agent", cfg.greeting);
  }

  // 画面の履歴だけ消してもサーバー側には会話の文脈が残るので、セッションIDごと捨てて
  // 新しい会話を始める。トークンはセッション名に紐づくので一緒に無効化する。
  function clearConversation() {
    if (busy) return;
    sessionStorage.removeItem(HISTORY_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    chatToken = null;
    chatTokenExpiry = 0;

    log.querySelectorAll(".harvest-agent-msg").forEach((el) => el.remove());
    setStatus("");
    showGreeting();
    textarea.focus();
  }

  function openPanel() {
    panel.classList.add("is-open");
    launcher.hidden = true;
    textarea.focus();
    scrollToBottom();
  }

  function closePanel() {
    panel.classList.remove("is-open");
    launcher.hidden = false;
  }

  async function submit() {
    const text = textarea.value.trim();
    if (!text || busy) return;

    textarea.value = "";
    textarea.style.height = "";
    appendMessage("user", text);
    recordHistory("user", text);
    setBusy(true);
    setStatus("考えています…");

    let bubble = null;
    let answer = "";
    const widgets = [];

    try {
      await sendToAgent(text, {
        onOutput(out) {
          if (out.progress) setStatus(out.progress);
          if (out.text) {
            setStatus("");
            answer += out.text;
            if (!bubble) bubble = appendMessage("agent", answer, true);
            else { setMessageContent(bubble, answer, true); scrollToBottom(); }
          }
          if (out.payload) {
            // エージェントからのカート操作指示
            findAddToCartCommands(out.payload).forEach((cmd) => addToCartById(cmd.productId));
            const widget = payloadWidget(out.payload);
            if (widget) widgets.push(widget);
          }
        }
      });
      if (answer || widgets.length) {
        // 受信完了後に描き直して、ウィジェット記法とペイロードをカードに置き換える
        if (!bubble) bubble = appendMessage("agent", answer, true);
        setMessageContent(bubble, answer, false, widgets);
        scrollToBottom();
        recordHistory("agent", answer, widgets);
      } else {
        appendMessage("agent", "うまく応答できませんでした。もう一度お試しください。");
      }
    } catch (error) {
      console.error("[Harvest & Co.] エージェント呼び出しに失敗しました", error);
      appendMessage("error", `エージェントに接続できませんでした。${error.message || ""}`);
    } finally {
      setStatus("");
      setBusy(false);
      textarea.focus();
    }
  }

  function buildWidget() {
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    launcher = document.createElement("button");
    launcher.id = "harvest-agent-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", cfg.chatTitle || "お買い物アシスタントを開く");
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>`;
    launcher.addEventListener("click", openPanel);

    panel = document.createElement("aside");
    panel.id = "harvest-agent-panel";
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", cfg.chatTitle || "お買い物アシスタント");
    panel.innerHTML = `
      <div class="harvest-agent-header">
        <div>
          <h2>${escapeHtml(cfg.chatTitle || "お買い物アシスタント")}</h2>
          ${cfg.subtitle ? `<p>${escapeHtml(cfg.subtitle)}</p>` : ""}
        </div>
        <div class="harvest-agent-actions">
          <button type="button" class="harvest-agent-clear" aria-label="会話の履歴を消す" title="会話の履歴を消す">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>
            </svg>
          </button>
          <button type="button" class="harvest-agent-close" aria-label="閉じる">&times;</button>
        </div>
      </div>
      <div class="harvest-agent-log" id="harvest-agent-log">
        <div class="harvest-agent-status" id="harvest-agent-status" hidden></div>
      </div>
      <form class="harvest-agent-form">
        <textarea rows="1" placeholder="メッセージを入力…" aria-label="メッセージ"></textarea>
        <button type="submit">送信</button>
      </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    log = panel.querySelector("#harvest-agent-log");
    statusEl = panel.querySelector("#harvest-agent-status");
    textarea = panel.querySelector("textarea");
    sendButton = panel.querySelector('button[type="submit"]');
    clearButton = panel.querySelector(".harvest-agent-clear");

    panel.querySelector(".harvest-agent-close").addEventListener("click", closePanel);
    clearButton.addEventListener("click", () => {
      if (busy) return;
      // 元に戻せないので一度だけ確認する (履歴が挨拶だけなら聞かない)
      if (loadHistory().length > 1 && !window.confirm("会話の履歴を消して、新しい会話を始めますか？")) return;
      clearConversation();
    });
    panel.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });

    // Enter で送信 / Shift+Enter で改行。日本語入力の変換確定 Enter は読み飛ばす。
    textarea.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel.classList.contains("is-open")) closePanel();
    });

    // 応答中のリンククリックをカート追加に橋渡しする
    log.addEventListener("click", (event) => {
      const anchor = event.target.closest("a");
      if (!anchor) return;
      const match = String(anchor.getAttribute("href") || "").match(ADD_TO_CART_HASH);
      if (match) {
        event.preventDefault();
        addToCartById(match[1]);
      }
    });

    const history = loadHistory();
    if (history.length) {
      history.forEach((entry) => appendMessage(entry.role, entry.text, false, entry.widgets));
    } else {
      showGreeting();
    }
  }

  // ==========================================================================
  // CART BRIDGE
  // ==========================================================================
  // エージェントからの応答をサイトのカート (localStorage) に反映します。
  //   a) 応答テキスト中の "#add-to-cart-<id>" リンク
  //   b) 構造化ペイロード { command: "add_to_cart", productId }

  function addToCartById(productId) {
    const id = Number(productId);
    if (!id || typeof window.addToCart !== "function") return;
    const run = () => window.addToCart(id);
    // 商品カタログの読み込み完了を待ってから追加する
    if (window.productsReady) window.productsReady.then(run);
    else run();
  }

  // ペイロード内の { command: "add_to_cart" } オブジェクトを再帰的に探す
  function findAddToCartCommands(node, found = []) {
    if (!node || typeof node !== "object") return found;
    if (node.command === "add_to_cart" && node.productId != null) {
      found.push(node);
      return found;
    }
    for (const value of Object.values(node)) {
      findAddToCartCommands(value, found);
    }
    return found;
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildWidget();
    console.info(`[Harvest & Co.] CX Agent Studio エージェント (${cfg.appId}) を読み込みました。`);
  });
})();
