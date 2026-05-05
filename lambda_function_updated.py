import json
import base64
import boto3

# Initialize Bedrock client
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')

# USPS Flat Rate Box pricing
FLAT_RATE_BOXES = {
    'Small': {'max_volume': 220, 'cost': 10.40},
    'Medium': {'max_volume': 880, 'cost': 17.05},
    'Large': {'max_volume': 1100, 'cost': 22.80}
}

WAX_COST_PER_OZ = 1.50

def lambda_handler(event, context):
    """
    Handle candle refill estimation requests.
    Accepts both multipart/form-data and JSON with base64 image.
    """
    try:
        # Parse request body
        if event.get('isBase64Encoded'):
            body = base64.b64decode(event['body']).decode('utf-8')
        else:
            body = event.get('body', '{}')
        
        # Check if it's JSON
        try:
            data = json.loads(body) if isinstance(body, str) else body
            
            # JSON format with base64 image
            if 'image' in data:
                image_data = data['image']
                email = data.get('email', '')
                address = data.get('address', '')
                
                # Decode base64 image
                if image_data.startswith('data:image'):
                    # Remove data URL prefix
                    image_data = image_data.split(',')[1]
                
                image_bytes = base64.b64decode(image_data)
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': 'Missing image field'})
                }
        
        except json.JSONDecodeError:
            # Multipart form data (old format)
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Expected JSON with base64 image'})
            }
        
        # Analyze image with Amazon Nova
        estimated_ounces = analyze_image_with_nova(image_bytes)
        
        # Calculate costs
        wax_cost = round(estimated_ounces * WAX_COST_PER_OZ, 2)
        
        # Calculate volume with 25% padding for shipping
        total_volume = estimated_ounces * 1.25
        
        # Select appropriate box
        box_type = select_box(total_volume)
        shipping_cost = FLAT_RATE_BOXES[box_type]['cost']
        
        total_cost = round(wax_cost + shipping_cost, 2)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': True,
                'estimated_ounces': estimated_ounces,
                'wax_cost': wax_cost,
                'shipping_cost': shipping_cost,
                'total_cost': total_cost,
                'box_type': box_type,
                'email': email,
                'address': address
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }

def analyze_image_with_nova(image_bytes):
    """Analyze candle container image using Amazon Nova Lite."""
    try:
        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        prompt = """You are analyzing a photo of a candle container placed next to a standard 12 oz soda can for size reference.

The soda can is 4.83 inches tall and 2.6 inches in diameter.

Please estimate the volume of the candle container in fluid ounces. Consider:
1. Compare the container's height and width to the soda can
2. Estimate the container's dimensions
3. Calculate approximate volume in fluid ounces
4. Typical candle containers range from 4oz to 20oz

Respond with ONLY a number representing the estimated ounces (e.g., "8" or "12.5")."""

        # Call Amazon Nova Lite
        response = bedrock_runtime.invoke_model(
            modelId='amazon.nova-lite-v1:0',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "image": {
                                    "format": "jpeg",
                                    "source": {
                                        "bytes": image_base64
                                    }
                                }
                            },
                            {
                                "text": prompt
                            }
                        ]
                    }
                ],
                "inferenceConfig": {
                    "max_new_tokens": 100,
                    "temperature": 0.3
                }
            })
        )
        
        # Parse response
        response_body = json.loads(response['body'].read())
        text_response = response_body['output']['message']['content'][0]['text'].strip()
        
        # Extract number from response
        import re
        numbers = re.findall(r'\d+\.?\d*', text_response)
        if numbers:
            estimated_oz = float(numbers[0])
            # Clamp between 4 and 20 oz
            estimated_oz = max(4, min(20, estimated_oz))
            return round(estimated_oz, 1)
        
        return 8.0  # Default fallback
    
    except Exception as e:
        print(f"Nova analysis error: {str(e)}")
        return 8.0  # Default fallback

def select_box(volume_oz):
    """Select appropriate USPS flat rate box based on volume."""
    for box_name in ['Small', 'Medium', 'Large']:
        if volume_oz <= FLAT_RATE_BOXES[box_name]['max_volume']:
            return box_name
    return 'Large'
