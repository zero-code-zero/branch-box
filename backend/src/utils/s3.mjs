import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Uploads a file (buffer) to S3
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {Buffer|Uint8Array} body - File content
 */
export const uploadSourceZip = async (bucket, key, body) => {
    try {
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
            }),
        );
        console.log(`Successfully uploaded to s3://${bucket}/${key}`);
    } catch (error) {
        console.error(`Failed to upload to S3: ${error.message}`);
        throw error;
    }
};
