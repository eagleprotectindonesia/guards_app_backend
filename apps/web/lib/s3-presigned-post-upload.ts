type PresignedPostPolicy = {
  url: string;
  key: string;
  fields: Record<string, string>;
  uploadMethod?: 'POST';
};

function extractS3Error(xml: string) {
  const codeMatch = xml.match(/<Code>([^<]+)<\/Code>/);
  const messageMatch = xml.match(/<Message>([^<]+)<\/Message>/);
  const requestIdMatch = xml.match(/<RequestId>([^<]+)<\/RequestId>/);

  return {
    code: codeMatch?.[1] ?? null,
    message: messageMatch?.[1] ?? null,
    requestId: requestIdMatch?.[1] ?? null,
  };
}

export async function uploadFileWithPresignedPost(policy: PresignedPostPolicy, file: File) {
  const form = new FormData();
  for (const [key, value] of Object.entries(policy.fields)) {
    form.append(key, value);
  }
  form.append('file', file);

  const response = await fetch(policy.url, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const rawBody = await response.text();
    const parsed = extractS3Error(rawBody);
    const s3Message = [parsed.code, parsed.message].filter(Boolean).join(': ');
    throw new Error(
      s3Message || `S3 upload failed with status ${response.status}${parsed.requestId ? ` (RequestId: ${parsed.requestId})` : ''}`
    );
  }
}
