import re
import ast
import json
import csv
import os

def load_products_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the array part: const localProducts = [ ... ];
    match = re.search(r'const\s+(?:local)?[Pp]roducts\s*=\s*(\[[\s\S]*?\n\]);', content)
    if not match:
        raise ValueError("Could not find products array in JS file")
    
    js_array = match.group(1)
    
    # Remove single line comments (but not protocol slashes like https://)
    js_array = re.sub(r'(?<!:)\/\/.*$', '', js_array, flags=re.MULTILINE)
    
    # Replace JS object keys with quoted keys for Python dict.
    # We only match keys that start a line (possibly with indentation) to avoid modifying URL protocols like https:
    js_array = re.sub(r'(?m)^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', js_array)
    
    # Replace JS booleans/null with Python equivalents
    js_array = js_array.replace('true', 'True')
    js_array = js_array.replace('false', 'False')
    js_array = js_array.replace('null', 'None')
    
    return ast.literal_eval(js_array)

def map_product_to_retail(p, site_base_url):
    availability = 'IN_STOCK'
    if p.get('inStock') is False:
        availability = 'OUT_OF_STOCK'

    categories = []
    if p.get('categoryName'):
        categories.append(p['categoryName'])
    if p.get('category'):
        categories.append(p['category'])
        
    price_info = {
        'currencyCode': 'JPY',
        'price': float(p.get('price', 0)),
        'originalPrice': float(p.get('price', 0))
    }
    
    images = []
    if p.get('image'):
        images.append({
            'uri': p['image']
        })
        
    rating = {
        'averageRating': float(p.get('rating', 0.0)),
        'ratingCount': int(p.get('reviewsCount', 0))
    }
    
    # Retail の Product.attributes は list ではなく map<string, CustomAttribute>。
    # list で渡すと取り込みは通るが属性が丸ごと落ちる。
    attributes = {}
    if p.get('origin'):
        attributes['origin'] = {'text': [p['origin']]}
    if p.get('unit'):
        attributes['unit'] = {'text': [p['unit']]}

    nutrition = p.get('nutrition')
    if nutrition:
        for k, v in nutrition.items():
            attributes[f'nutrition_{k}'] = {'text': [v]}

    product = {
        'id': str(p.get('id')),
        'title': p.get('name'),
        # languageCode が無いと日本語のトークナイズが効かず、商品名の一部
        # (例:「黒毛和牛A5ランク…」の「和牛」) で検索がヒットしなくなる。
        # Console からの取り込みでは自動で付くが、API 取り込みでは付かない。
        'languageCode': 'ja',
        'categories': categories,
        'description': p.get('description', ''),
        'priceInfo': price_info,
        'images': images,
        'rating': rating,
        'availability': availability,
        'attributes': attributes
    }
    # 商品詳細ページの URL。フィールド名は uri (url ではない)。
    # url にすると取り込み時に無視され、カタログ側は空のままになる。
    if site_base_url:
        product['uri'] = f"{site_base_url.rstrip('/')}/product.html?id={product['id']}"
    return product

def main():
    # Execute relative to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    # 商品詳細ページの URL に使うサイトのベース URL。
    # サイトを Cloud Run にデプロイして得た URL を渡してください。
    #   SITE_BASE_URL=https://... python3 js/convert_products.py
    site_base_url = os.environ.get('SITE_BASE_URL', '')
    if not site_base_url:
        print('警告: SITE_BASE_URL が未設定のため、uri (商品ページURL) を出力しません。')

    js_path = os.path.join(project_dir, 'js', 'products.js')
    products = load_products_js(js_path)
    retail_products = [map_product_to_retail(p, site_base_url) for p in products]

    # 1. Save as JSONL (Retail のカタログ取り込みはこの形式を使う)
    jsonl_path = os.path.join(project_dir, 'products.jsonl')
    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for p in retail_products:
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
    print(f"Successfully wrote {jsonl_path} ({len(retail_products)} products)")

    # 2. Save as CSV (複雑なフィールドは JSON 文字列として直列化)
    csv_path = os.path.join(project_dir, 'products_for_bq.csv')
    csv_headers = ['id', 'title', 'languageCode', 'categories', 'description', 'priceInfo',
                   'images', 'rating', 'availability', 'attributes', 'uri']

    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(csv_headers)
        for p in retail_products:
            row = []
            for col in csv_headers:
                val = p.get(col, '')
                if isinstance(val, (dict, list)):
                    # Serialize complex types to JSON string
                    row.append(json.dumps(val, ensure_ascii=False))
                else:
                    row.append(str(val))
            writer.writerow(row)
    print(f"Successfully wrote {csv_path}")

if __name__ == '__main__':
    main()
