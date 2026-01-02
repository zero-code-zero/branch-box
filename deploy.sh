#!/bin/bash
set -e

STACK_NAME="branch-box"
REGION="ap-northeast-2"
FRONTEND_DIR="./frontend"
BACKEND_DIR="./backend"

echo "=========================================="
echo "🚀 Branch-Box Deployment Initiated"
echo "=========================================="

# Check if aws and sam CLI are installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command -v sam &> /dev/null; then
    echo "❌ SAM CLI is not installed. Please install it first."
    exit 1
fi

# 1. Deploy Backend
echo ""
echo "backend deploy..."
echo "------------------------------------------"
cd $BACKEND_DIR
sam build
sam deploy --guided --stack-name $STACK_NAME --region $REGION --capabilities CAPABILITY_NAMED_IAM

cd ..

# 2. Fetch Outputs
echo ""
echo "fetch cloudformation outputs..."
echo "------------------------------------------"
# We use AWS CLI to get the outputs in JSON format
OUTPUTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query "Stacks[0].Outputs" --output json)

# Extract values using simple python script to avoid jq dependency, or just grep/awk. 
# Let's use a small node script since we have node.
# We need: ApiEndpoint, UserPoolId, UserPoolClientId, FrontendBucketName, FrontendUrl
# And AWS_REGION (which is $REGION)

echo "parsing outputs..."

# Create .env.production content
# We pass the JSON outputs to a node one-liner to format them as .env lines
NODE_SCRIPT="
const outputs = JSON.parse(process.argv[1]);
const find = (key) => {
    const found = outputs.find(o => o.OutputKey === key);
    return found ? found.OutputValue : '';
};

console.log('VITE_API_ENDPOINT=' + find('ApiEndpoint'));
console.log('VITE_USER_POOL_ID=' + find('UserPoolId'));
console.log('VITE_USER_POOL_CLIENT_ID=' + find('UserPoolClientId'));
console.log('VITE_AWS_REGION=$REGION');
console.log('VITE_DEV_MODE=false');
# Also print the bucket name for the script to pick up
console.log('#BUCKET=' + find('FrontendBucketName'));
console.log('#DIST=' + find('FrontendDistributionId'));
"

# Generate the .env content and extract bucket name
ENV_CONTENT=$(node -e "$NODE_SCRIPT" "$OUTPUTS")
BUCKET_NAME=$(echo "$ENV_CONTENT" | grep "#BUCKET=" | cut -d'=' -f2)
DIST_ID=$(echo "$ENV_CONTENT" | grep "#DIST=" | cut -d'=' -f2)

# Remove the internal markers from the file content
FINAL_ENV_CONTENT=$(echo "$ENV_CONTENT" | grep -v "#BUCKET=" | grep -v "#DIST=")

echo "generated frontend/.env.production:"
echo "$FINAL_ENV_CONTENT"

echo "$FINAL_ENV_CONTENT" > "$FRONTEND_DIR/.env.production"

# 3. Build Frontend
echo ""
echo "building frontend..."
echo "------------------------------------------"
cd $FRONTEND_DIR
npm install
npm run build
cd ..

# 4. Deploy to S3
if [ -z "$BUCKET_NAME" ]; then
    echo "❌ Could not find FrontendBucketName in stack outputs. Did the backend deploy fail?"
    exit 1
fi

echo ""
echo "deploying to s3://$BUCKET_NAME..."
echo "------------------------------------------"
aws s3 sync "$FRONTEND_DIR/dist" "s3://$BUCKET_NAME" --delete

# 5. Invalidate CloudFront (Optional but recommended)
if [ -n "$DIST_ID" ]; then
    echo ""
    echo "Emptying CloudFront cache ($DIST_ID)..."
    echo "------------------------------------------"
    aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
