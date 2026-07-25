import re
import ast
import json
import csv
import os

def load_products_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the array part: products = [ ... ]
    match = re.search(r'const\s+products\s*=\s*(\[[\s\S]*?\]);', content)
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

def map_product_to_bq(p):
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
    
    attributes = []
    if p.get('origin'):
        attributes.append({
            'key': 'origin',
            'value': {'text': [p['origin']]}
        })
    if p.get('unit'):
        attributes.append({
            'key': 'unit',
            'value': {'text': [p['unit']]}
        })
        
    nutrition = p.get('nutrition')
    if nutrition:
        for k, v in nutrition.items():
            attributes.append({
                'key': f'nutrition_{k}',
                'value': {'text': [v]}
            })
            
    return {
        'id': str(p.get('id')),
        'title': p.get('name'),
        'categories': categories,
        'description': p.get('description', ''),
        'priceInfo': price_info,
        'images': images,
        'rating': rating,
        'availability': availability,
        'attributes': attributes
    }

def main():
    # Execute relative to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    js_path = os.path.join(project_dir, 'js', 'products.js')
    products = load_products_js(js_path)
    bq_products = [map_product_to_bq(p) for p in products]
    
    # 1. Save as JSONL (Highly recommended for BQ import with nested schema)
    jsonl_path = os.path.join(project_dir, 'products.jsonl')
    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for p in bq_products:
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
    print(f"Successfully wrote {jsonl_path}")
    
    # 2. Save as CSV (User requested, but complex fields are JSON serialized)
    csv_path = os.path.join(project_dir, 'products_for_bq.csv')
    csv_headers = ['id', 'title', 'categories', 'description', 'priceInfo', 'images', 'rating', 'availability', 'attributes']
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(csv_headers)
        for p in bq_products:
            row = []
            for col in csv_headers:
                val = p[col]
                if isinstance(val, (dict, list)):
                    # Serialize complex types to JSON string
                    row.append(json.dumps(val, ensure_ascii=False))
                else:
                    row.append(str(val))
            writer.writerow(row)
    print(f"Successfully wrote {csv_path}")

if __name__ == '__main__':
    main()
