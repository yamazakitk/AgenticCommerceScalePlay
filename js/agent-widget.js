// CX Agent Studio (Conversational Agents / Dialogflow CX) 連携
//
// CX Agent Studio で構築した Agentic Commerce エージェントを、Dialogflow
// Messenger ウィジェットとしてトップページに埋め込みます。
//
// 設定値の取得方法:
//   Conversational Agents (Dialogflow CX) コンソールで対象エージェントを開き、
//   「Integrations (統合)」>「Dialogflow Messenger」を有効化すると、
//   project-id / agent-id / location を含む埋め込みコードが表示されます。
//   その値を以下に転記してください。
//
// agentId が "YOUR_" で始まるデフォルト値のままの場合、ウィジェットは
// 読み込まれません (サイトは通常どおり動作します)。

window.AGENT_STUDIO_CONFIG = {
  projectId: "yamazakitlab",             // エージェントが属する GCP プロジェクトID
  agentId: "YOUR_AGENT_ID",              // エージェントID (UUID形式)
  location: "asia-northeast1",           // エージェントのリージョン (例: global, asia-northeast1)
  languageCode: "ja",
  chatTitle: "Harvest & Co. お買い物アシスタント"
};

(function () {
  const cfg = window.AGENT_STUDIO_CONFIG;
  const isConfigured = !!(cfg &&
    cfg.projectId && !cfg.projectId.startsWith("YOUR_") &&
    cfg.agentId && !cfg.agentId.startsWith("YOUR_"));

  if (!isConfigured) {
    console.info("[Harvest & Co.] CX Agent Studio 未設定のため、エージェントウィジェットは無効です。(js/agent-widget.js)");
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1. Dialogflow Messenger のスタイルシートとスクリプトを読み込み
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://www.gstatic.com/dialogflow-console/fast/df-messenger/prod/v1/themes/df-messenger-default.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/dialogflow-console/fast/df-messenger/prod/v1/df-messenger.js";
    document.head.appendChild(script);

    // 2. Harvest & Co. のデザインシステム (DESIGN.md) に合わせたテーマ
    const style = document.createElement("style");
    style.textContent = `
      df-messenger {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 999;
        --df-messenger-font-family: 'DM Sans', sans-serif;
        --df-messenger-font-color: #2A2E2B;
        --df-messenger-chat-background: #FAFAF7;
        --df-messenger-message-user-background: #EAEAE3;
        --df-messenger-message-bot-background: #FFFFFF;
        --df-messenger-primary-color: #1A3A2B;
        --df-messenger-focus-color: #D4A373;
        --df-messenger-titlebar-background: #1A3A2B;
        --df-messenger-titlebar-font-color: #FFFFFF;
        --df-messenger-chat-bubble-background: #1A3A2B;
        --df-messenger-chat-bubble-icon-color: #FFFFFF;
        --df-messenger-send-icon-color: #1A3A2B;
      }
    `;
    document.head.appendChild(style);

    // 3. ウィジェット本体 (チャットバブル形式) を配置
    const messenger = document.createElement("df-messenger");
    messenger.setAttribute("project-id", cfg.projectId);
    messenger.setAttribute("agent-id", cfg.agentId);
    messenger.setAttribute("location", cfg.location || "global");
    messenger.setAttribute("language-code", cfg.languageCode || "ja");
    messenger.setAttribute("max-query-length", "-1");
    messenger.setAttribute("storage-option", "none");

    const bubble = document.createElement("df-messenger-chat-bubble");
    bubble.setAttribute("chat-title", cfg.chatTitle || "お買い物アシスタント");
    messenger.appendChild(bubble);

    document.body.appendChild(messenger);
    console.info(`[Harvest & Co.] CX Agent Studio エージェント (${cfg.agentId}) を読み込みました。`);

    // 4. エージェント ⇔ サイトカートのブリッジ
    setupCartBridge();
  });

  // ==========================================================================
  // CART BRIDGE
  // ==========================================================================
  // エージェント (webhook) からの応答をサイトのカート (localStorage) に反映します。
  //   a) カルーセルの「カートに追加」ボタン: anchor が "#add-to-cart-<id>" 形式
  //   b) チャット発話でのカート追加: カスタムペイロード { command: "add_to_cart", productId }

  const ADD_TO_CART_HASH = /#add-to-cart-(\d+)$/;

  function addToCartById(productId) {
    const id = Number(productId);
    if (!id || typeof window.addToCart !== "function") return;
    const run = () => window.addToCart(id);
    // 商品カタログの読み込み完了を待ってから追加する
    if (window.productsReady) {
      window.productsReady.then(run);
    } else {
      run();
    }
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

  function setupCartBridge() {
    // a) ボタン/チップ/カードのクリック (#add-to-cart-<id> リンクを横取り)
    ["df-button-clicked", "df-chip-clicked", "df-info-card-clicked", "df-list-element-clicked"].forEach((type) => {
      window.addEventListener(type, (event) => {
        const d = event.detail || {};
        const href = d.anchor?.href || d.actionLink || d.link || d.href || d.url || "";
        const match = String(href).match(ADD_TO_CART_HASH);
        if (match) {
          if (typeof event.preventDefault === "function") event.preventDefault();
          addToCartById(match[1]);
        }
      });
    });

    // クリックイベントを横取りできなかった場合のフォールバック (URLハッシュ遷移を検出)
    window.addEventListener("hashchange", () => {
      const match = window.location.hash.match(ADD_TO_CART_HASH);
      if (match) {
        addToCartById(match[1]);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    });

    // b) webhook 応答のカスタムペイロード ({ command: "add_to_cart", productId })
    window.addEventListener("df-response-received", (event) => {
      const commands = findAddToCartCommands(event.detail);
      commands.forEach((cmd) => addToCartById(cmd.productId));
    });
  }
})();
