// Product Database for Harvest & Co.
//
// 商品データの取得元は Firestore です (js/config.js で接続設定)。
// Firebase が未設定の場合や読み込みに失敗した場合は、以下のローカル配列に
// フォールバックします。各ページは window.productsReady (Promise) を await
// してから window.products を参照してください。

const localProducts = [
  // === VEGETABLES (野菜) ===
  {
    id: 1,
    name: "新潟県産 有機栽培完熟トマト",
    category: "vegetables",
    categoryName: "野菜",
    price: 498,
    unit: "1パック（3個入）",
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80",
    description: "新潟の豊かな土壌で有機栽培された、甘みと酸味のバランスが抜群の完熟トマト。サラダやパスタソースに最適です。",
    origin: "新潟県産",
    rating: 4.8,
    reviewsCount: 32,
    inStock: true,
    nutrition: {
      calories: "22 kcal",
      protein: "1.0 g",
      fat: "0.1 g",
      carbs: "4.7 g"
    }
  },
  {
    id: 2,
    name: "北海道産 有機たまねぎ",
    category: "vegetables",
    categoryName: "野菜",
    price: 320,
    unit: "1袋（4個入）",
    image: "https://images.unsplash.com/photo-1508747703725-719777637510?w=600&auto=format&fit=crop&q=80",
    description: "北の大地でじっくり育ったたまねぎ。熱を通すことで甘みがさらに引き立ち、スープやカレーに深いコクを与えます。",
    origin: "北海道産",
    rating: 4.6,
    reviewsCount: 18,
    inStock: true,
    nutrition: {
      calories: "37 kcal",
      protein: "1.0 g",
      fat: "0.1 g",
      carbs: "8.4 g"
    }
  },
  {
    id: 3,
    name: "信州高原 朝採れシャキシャキレタス",
    category: "vegetables",
    categoryName: "野菜",
    price: 248,
    unit: "1個",
    image: "https://images.unsplash.com/photo-1506073881649-4e23be3e9ed0?w=600&auto=format&fit=crop&q=80",
    description: "標高の高い信州高原で、早朝に収穫された新鮮なレタス。みずみずしく、パリッとした食感をお楽しみください。",
    origin: "長野県産",
    rating: 4.7,
    reviewsCount: 25,
    inStock: true,
    nutrition: {
      calories: "12 kcal",
      protein: "0.6 g",
      fat: "0.1 g",
      carbs: "2.8 g"
    }
  },
  {
    id: 4,
    name: "愛媛県産 無農薬プレミアムアボカド",
    category: "vegetables",
    categoryName: "野菜",
    price: 398,
    unit: "1個",
    image: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80",
    description: "国内では大変稀少な、愛媛県産の無農薬アボカド。とろけるような濃厚な味わいと、上品な後味が特徴です。",
    origin: "愛媛県産",
    rating: 4.9,
    reviewsCount: 41,
    inStock: true,
    nutrition: {
      calories: "187 kcal",
      protein: "2.5 g",
      fat: "18.7 g",
      carbs: "6.2 g"
    }
  },

  // === FRUITS (果物) ===
  {
    id: 5,
    name: "長野県産 特選サンふじりんご",
    category: "fruits",
    categoryName: "果物",
    price: 580,
    unit: "1袋（2個入）",
    image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&auto=format&fit=crop&q=80",
    description: "太陽の光をたっぷりと浴びて蜜がしっかり入ったサンふじ。甘み、酸味、そして歯ごたえの三拍子が揃った一品です。",
    origin: "長野県産",
    rating: 4.9,
    reviewsCount: 54,
    inStock: true,
    nutrition: {
      calories: "54 kcal",
      protein: "0.2 g",
      fat: "0.1 g",
      carbs: "14.3 g"
    }
  },
  {
    id: 6,
    name: "福岡県産 朝摘みあまおういちご",
    category: "fruits",
    categoryName: "果物",
    price: 980,
    unit: "1パック（約250g）",
    image: "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600&auto=format&fit=crop&q=80",
    description: "「あかい・まるい・おおきい・うまい」の頭文字を取った、日本を代表する高級いちご。豊かな香りとジューシーな果肉をご堪能ください。",
    origin: "福岡県産",
    rating: 4.9,
    reviewsCount: 68,
    inStock: true,
    nutrition: {
      calories: "34 kcal",
      protein: "0.9 g",
      fat: "0.1 g",
      carbs: "8.5 g"
    }
  },
  {
    id: 7,
    name: "エクアドル産 有機プレミアムバナナ",
    category: "fruits",
    categoryName: "果物",
    price: 348,
    unit: "1袋（3〜4本）",
    image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop&q=80",
    description: "高地でゆっくりと時間をかけて育てられた有機栽培バナナ。コクのある甘みともっちりとした食感が人気です。",
    origin: "エクアドル産",
    rating: 4.5,
    reviewsCount: 15,
    inStock: true,
    nutrition: {
      calories: "86 kcal",
      protein: "1.1 g",
      fat: "0.2 g",
      carbs: "22.5 g"
    }
  },

  // === MEAT (精肉・肉加工品) ===
  {
    id: 8,
    name: "北海道産 黒毛和牛A5ランクサーロインステーキ",
    category: "meat",
    categoryName: "精肉",
    price: 3800,
    unit: "1枚（約200g）",
    image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80",
    description: "最高品質の黒毛和牛A5ランクサーロイン。きめ細やかな霜降りと、お口の中でとろけるような極上の旨味をお楽しみいただけます。",
    origin: "北海道産",
    rating: 5.0,
    reviewsCount: 47,
    inStock: true,
    nutrition: {
      calories: "498 kcal",
      protein: "11.7 g",
      fat: "47.5 g",
      carbs: "0.3 g"
    }
  },
  {
    id: 9,
    name: "鹿児島県産 黒豚バラ肉薄切り",
    category: "meat",
    categoryName: "精肉",
    price: 1280,
    unit: "300g",
    image: "https://images.unsplash.com/photo-1551028150-64b9f398f678?w=600&auto=format&fit=crop&q=80",
    description: "鹿児島の大自然でサツマイモを食べて育った黒豚。脂身の甘さとさっぱりとした口溶けが格別で、しゃぶしゃぶや肉巻きに最適です。",
    origin: "鹿児島県産",
    rating: 4.8,
    reviewsCount: 29,
    inStock: true,
    nutrition: {
      calories: "386 kcal",
      protein: "14.2 g",
      fat: "35.0 g",
      carbs: "0.1 g"
    }
  },
  {
    id: 10,
    name: "岩手県産 南部どり もも肉（地鶏）",
    category: "meat",
    categoryName: "精肉",
    price: 780,
    unit: "300g",
    image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&auto=format&fit=crop&q=80",
    description: "こだわりの無添加飼料で育てられた銘柄鶏「南部どり」。弾力ある適度な歯ごたえと、コク深い味わいが特徴です。",
    origin: "岩手県産",
    rating: 4.7,
    reviewsCount: 31,
    inStock: true,
    nutrition: {
      calories: "200 kcal",
      protein: "16.6 g",
      fat: "14.0 g",
      carbs: "0.0 g"
    }
  },

  // === SEAFOOD (鮮魚・海産物) ===
  {
    id: 11,
    name: "北海道産 天然本鮭切身",
    category: "seafood",
    categoryName: "鮮魚",
    price: 880,
    unit: "2切",
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80",
    description: "北海道で水揚げされた天然の本鮭を、丁寧に切り身にしました。ほどよい塩加減と上品な脂のりで、朝食の主役にぴったりです。",
    origin: "北海道産",
    rating: 4.6,
    reviewsCount: 22,
    inStock: true,
    nutrition: {
      calories: "133 kcal",
      protein: "22.3 g",
      fat: "4.1 g",
      carbs: "0.1 g"
    }
  },
  {
    id: 12,
    name: "静岡県産 炭火焼きかつおのたたき",
    category: "seafood",
    categoryName: "鮮魚",
    price: 980,
    unit: "1パック（スライス済・約200g）",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
    description: "黒潮に乗って北上する新鮮な鰹を、伝統の炭火焼き製法でたたきに仕上げました。香ばしい皮目と濃厚な赤身をお楽しみください。",
    origin: "静岡県産",
    rating: 4.8,
    reviewsCount: 36,
    inStock: true,
    nutrition: {
      calories: "165 kcal",
      protein: "25.0 g",
      fat: "6.2 g",
      carbs: "0.2 g"
    }
  },
  {
    id: 13,
    name: "宮媛県産 活け締め真鯛のサク",
    category: "seafood",
    categoryName: "鮮魚",
    price: 1380,
    unit: "1本（約150g）",
    image: "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600&auto=format&fit=crop&q=80",
    description: "愛媛の澄んだ海で育ち、活け締めされた新鮮な真鯛。透明感のある上品な白身は、お刺身やカルパッチョに最適です。",
    origin: "愛媛県産",
    rating: 4.9,
    reviewsCount: 19,
    inStock: true,
    nutrition: {
      calories: "142 kcal",
      protein: "21.7 g",
      fat: "5.8 g",
      carbs: "0.1 g"
    }
  },

  // === DAIRY & EGGS (乳製品・卵) ===
  {
    id: 14,
    name: "北海道十勝 濃厚プレミアム牛乳",
    category: "dairy",
    categoryName: "乳製品",
    price: 360,
    unit: "1000ml",
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&auto=format&fit=crop&q=80",
    description: "十勝ののびのびとした環境で育った牛から絞られた特選低温殺菌牛乳。まるで生クリームのような濃厚なコクとすっきりとした後味が両立しています。",
    origin: "北海道産",
    rating: 4.8,
    reviewsCount: 59,
    inStock: true,
    nutrition: {
      calories: "67 kcal (per 100ml)",
      protein: "3.4 g",
      fat: "3.8 g",
      carbs: "4.8 g"
    }
  },
  {
    id: 15,
    name: "信州高原 豊かな森の平飼い卵",
    category: "dairy",
    categoryName: "乳製品",
    price: 498,
    unit: "1パック（10個入）",
    image: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop&q=80",
    description: "平飼いでのびのび運動し、自然の餌をたくさん食べた鶏から生まれた健康的な卵。黄身が非常に濃厚で、卵かけご飯にすると違いがよくわかります。",
    origin: "長野県産",
    rating: 4.9,
    reviewsCount: 74,
    inStock: true,
    nutrition: {
      calories: "91 kcal (per egg)",
      protein: "7.4 g",
      fat: "6.5 g",
      carbs: "0.2 g"
    }
  },
  {
    id: 16,
    name: "ギリシャ風 砂糖不使用オーガニックヨーグルト",
    category: "dairy",
    categoryName: "乳製品",
    price: 398,
    unit: "400g",
    image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&auto=format&fit=crop&q=80",
    description: "水切り製法でじっくりと濃縮された、もったり濃厚なギリシャヨーグルト。無糖でありながらクリーミーな口当たりで、果物や蜂蜜と相性抜群です。",
    origin: "国産",
    rating: 4.7,
    reviewsCount: 42,
    inStock: true,
    nutrition: {
      calories: "95 kcal (per 100g)",
      protein: "8.2 g",
      fat: "4.5 g",
      carbs: "3.8 g"
    }
  },

  // === BAKERY (パン・ベーカリー) ===
  {
    id: 17,
    name: "焼き立て天然酵母のクロワッサン",
    category: "bakery",
    categoryName: "パン",
    price: 320,
    unit: "1袋（2個入）",
    image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80",
    description: "フランス産AOPバターを贅沢に織り込んだ天然酵母のクロワッサン。外はサクサク、中はしっとりとした極上の食感と芳醇なバターの香りが広がります。",
    origin: "自家製 (店内で焼き上げ)",
    rating: 4.9,
    reviewsCount: 88,
    inStock: true,
    nutrition: {
      calories: "280 kcal (per piece)",
      protein: "4.5 g",
      fat: "16.8 g",
      carbs: "27.5 g"
    }
  },
  {
    id: 18,
    name: "信州産小麦 プレミアム生食パン",
    category: "bakery",
    categoryName: "パン",
    price: 650,
    unit: "1本（2斤）",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80",
    description: "信州産小麦と北海道産生クリームを使用し、耳まで柔らかく仕上げた最高級生食パン。まずはトーストせずに、そのままちぎって召し上がりください。",
    origin: "自家製 (店内で焼き上げ)",
    rating: 4.8,
    reviewsCount: 61,
    inStock: true,
    nutrition: {
      calories: "264 kcal (per 100g)",
      protein: "7.8 g",
      fat: "4.2 g",
      carbs: "48.2 g"
    }
  },
  {
    id: 19,
    name: "オーガニック全粒粉のカンパーニュ",
    category: "bakery",
    categoryName: "パン",
    price: 520,
    unit: "1個（ハーフサイズ）",
    image: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=600&auto=format&fit=crop&q=80",
    description: "石窯で焼き上げた、有機全粒粉の本格的カンパーニュ。噛むほどに広がる酸味と小麦本来の素朴な香ばしさは、チーズやワインに完璧にマッチします。",
    origin: "自家製 (店内で焼き上げ)",
    rating: 4.6,
    reviewsCount: 23,
    inStock: true,
    nutrition: {
      calories: "220 kcal (per 100g)",
      protein: "8.5 g",
      fat: "1.2 g",
      carbs: "45.0 g"
    }
  },

  // === BEVERAGES (飲料・お茶) ===
  {
    id: 20,
    name: "静岡手摘み 特選一番煎茶（有機）",
    category: "beverages",
    categoryName: "飲料",
    price: 1200,
    unit: "1袋（100g）",
    image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80",
    description: "静岡の契約茶園で手摘みされた特選の有機一番茶。まろやかな甘みと澄んだ美しい深緑、豊かな香りが心安らぐ時間を演出します。",
    origin: "静岡県産",
    rating: 4.7,
    reviewsCount: 19,
    inStock: true,
    nutrition: {
      calories: "0 kcal",
      protein: "0.0 g",
      fat: "0.0 g",
      carbs: "0.0 g"
    }
  },
  {
    id: 21,
    name: "エチオピア・イルガチェフェ シングルオリジン珈琲（豆）",
    category: "beverages",
    categoryName: "飲料",
    price: 1580,
    unit: "1袋（200g）",
    image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80",
    description: "エチオピアのイルガチェフェ地区で栽培された、フローラルな香りが特徴の高級コーヒー。上品な酸味と、紅茶を思わせる華やかな余韻をお楽しみいただけます。",
    origin: "エチオピア産",
    rating: 4.9,
    reviewsCount: 45,
    inStock: true,
    nutrition: {
      calories: "4 kcal (per cup)",
      protein: "0.2 g",
      fat: "0.1 g",
      carbs: "0.7 g"
    }
  },
  {
    id: 22,
    name: "南アルプス 氷河伏流水天然水",
    category: "beverages",
    categoryName: "飲料",
    price: 120,
    unit: "500ml",
    image: "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=600&auto=format&fit=crop&q=80",
    description: "南アルプスの何層もの地層で磨かれた、清らかな硬度約30の極軟水。すっきりクリアで体にしみわたる美味しさです。",
    origin: "山梨県産",
    rating: 4.8,
    reviewsCount: 82,
    inStock: true,
    nutrition: {
      calories: "0 kcal",
      protein: "0.0 g",
      fat: "0.0 g",
      carbs: "0.0 g"
    }
  },
  {
    id: 23,
    name: "コールドプレス 100%オーガニックオレンジ",
    category: "beverages",
    categoryName: "飲料",
    price: 680,
    unit: "1本（250ml）",
    image: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80",
    description: "熱を加えずに摩擦を最小限に抑えて圧搾したコールドプレスジュース。オレンジが持つビタミンCや酵素をそのまま補給でき、爽やかでジューシーです。",
    origin: "国産",
    rating: 4.7,
    reviewsCount: 30,
    inStock: true,
    nutrition: {
      calories: "110 kcal",
      protein: "1.8 g",
      fat: "0.2 g",
      carbs: "25.2 g"
    }
  },

  // === PANTRY & SEASONING (米・調味料) ===
  {
    id: 24,
    name: "新潟県魚沼産 特選有機コシヒカリ",
    category: "pantry",
    categoryName: "調味料",
    price: 3980,
    unit: "5kg",
    image: "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=600&auto=format&fit=crop&q=80",
    description: "豪雪地帯である魚沼の冷たい雪解け水で育まれた特撰のコシヒカリ。ふっくらとモチモチした食感で、強い甘みとツヤが格別なお米です。",
    origin: "新潟県産",
    rating: 5.0,
    reviewsCount: 93,
    inStock: true,
    nutrition: {
      calories: "168 kcal (per 100g cooked)",
      protein: "2.5 g",
      fat: "0.3 g",
      carbs: "37.1 g"
    }
  },
  {
    id: 25,
    name: "伝統木桶仕込み 天然醸造特選醤油",
    category: "pantry",
    categoryName: "調味料",
    price: 850,
    unit: "1本（360ml）",
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&auto=format&fit=crop&q=80",
    description: "香川県小豆島で、100年以上使われている木桶の中で二夏じっくり熟成させた天然醸造の生醤油。驚くほどまろやかでコクがあり、お刺身や焼き魚に最適です。",
    origin: "香川県産",
    rating: 4.9,
    reviewsCount: 38,
    inStock: true,
    nutrition: {
      calories: "13 kcal (per 15ml)",
      protein: "1.5 g",
      fat: "0.0 g",
      carbs: "1.2 g"
    }
  },
  {
    id: 26,
    name: "シチリア島直輸入 エキストラバージンオリーブオイル",
    category: "pantry",
    categoryName: "調味料",
    price: 2480,
    unit: "1本（500ml）",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80",
    description: "シチリア島で手摘み収穫後すぐに冷温圧搾された、新鮮でフルーティーなオリーブオイル。青リンゴやハーブを思わせる爽やかな香りとスパイシーな余韻が際立ちます。",
    origin: "イタリア・シチリア島産",
    rating: 4.8,
    reviewsCount: 27,
    inStock: true,
    nutrition: {
      calories: "120 kcal (per 14g)",
      protein: "0.0 g",
      fat: "14.0 g",
      carbs: "0.0 g"
    }
  },
  {
    id: 27,
    name: "信州・八ヶ岳 アカシア極上純粋蜂蜜",
    category: "pantry",
    categoryName: "調味料",
    price: 1890,
    unit: "1本（250g）",
    image: "https://images.unsplash.com/photo-1448062885262-aa6670248b0e?w=600&auto=format&fit=crop&q=80",
    description: "八ヶ岳の豊かな自然の中で育つアカシアの花から集められた、無添加・非加熱の純粋はちみつ。上品でクセのない甘みと透明感は、ヨーグルトや紅茶にピッタリです。",
    origin: "長野県産",
    rating: 4.9,
    reviewsCount: 33,
    inStock: true,
    nutrition: {
      calories: "294 kcal (per 100g)",
      protein: "0.2 g",
      fat: "0.0 g",
      carbs: "79.7 g"
    }
  },
  {
    id: 28,
    name: "北海道産 無添加完熟かぼちゃポタージュ",
    category: "pantry",
    categoryName: "調味料",
    price: 420,
    unit: "1袋（180g）",
    image: "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=600&auto=format&fit=crop&q=80",
    description: "北海道で収穫された甘みの強い完熟かぼちゃを贅沢に使用し、牛乳とバターだけで仕上げた無添加スープ。コクと甘みが濃密で、心温まる一杯です。",
    origin: "北海道産",
    rating: 4.6,
    reviewsCount: 20,
    inStock: false, // SOLD OUT SAMPLE
    nutrition: {
      calories: "148 kcal",
      protein: "2.4 g",
      fat: "6.8 g",
      carbs: "19.5 g"
    }
  }
];

// ==========================================================================
// FIRESTORE INTEGRATION
// ==========================================================================
// Firebase Web SDK (ESM, CDN) を動的 import して Firestore から商品カタログを
// 読み込みます。js/config.js が未設定 (YOUR_ プレフィックスのまま) の
// 場合はローカルカタログをそのまま使用します。

const FIREBASE_SDK_VERSION = "10.12.2";

function isFirebaseConfigured() {
  const config = typeof window !== "undefined" ? window.FIREBASE_CONFIG : null;
  return !!(config && config.apiKey && !config.apiKey.startsWith("YOUR_") &&
            config.projectId && !config.projectId.startsWith("YOUR_"));
}

async function loadProductsFromFirestore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [{ initializeApp }, { getFirestore, collection, getDocs }] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`)
  ]);

  const app = initializeApp(window.FIREBASE_CONFIG);
  const db = getFirestore(app);
  const collectionName = window.FIRESTORE_PRODUCTS_COLLECTION || "products";
  const snapshot = await getDocs(collection(db, collectionName));

  const loaded = snapshot.docs.map(doc => {
    const data = doc.data();
    // ページ側は数値IDで検索するため、IDを数値に正規化する
    return { ...data, id: Number(data.id ?? doc.id) };
  });

  loaded.sort((a, b) => a.id - b.id);
  return loaded;
}

// If using ES Modules, we export this. In simple static HTML sites we can bind to window.
if (typeof window !== "undefined") {
  // フォールバック値を即時バインド (Firestore 読み込み完了後に置き換わる)
  window.products = localProducts;

  window.productsReady = (async () => {
    if (!isFirebaseConfigured()) {
      console.info("[Harvest & Co.] Firebase 未設定のため、ローカル商品カタログを使用します。");
      return window.products;
    }
    try {
      const loaded = await loadProductsFromFirestore();
      if (loaded.length > 0) {
        window.products = loaded;
        console.info(`[Harvest & Co.] Firestore から ${loaded.length} 件の商品を読み込みました。`);
      } else {
        console.warn("[Harvest & Co.] Firestore のコレクションが空です。ローカルカタログにフォールバックします。");
      }
    } catch (e) {
      console.error("[Harvest & Co.] Firestore からの読み込みに失敗しました。ローカルカタログにフォールバックします。", e);
    }
    return window.products;
  })();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = localProducts;
}
