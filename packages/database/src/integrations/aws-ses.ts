import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailEventPayload, EmailTemplateId } from '@repo/types';

type RenderedTemplate = {
  subject: string;
  html: string;
  text: string;
};

const DEFAULT_REGION = process.env.AWS_REGION || 'us-east-1';

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || DEFAULT_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function getSenderAddress() {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  const fromName = process.env.AWS_SES_FROM_NAME;

  if (!fromEmail) {
    throw new Error('AWS_SES_FROM_EMAIL is not configured');
  }

  if (!fromName) {
    return fromEmail;
  }

  return `${fromName} <${fromEmail}>`;
}

function requireContext(context: Record<string, string>, key: string) {
  const value = context[key];
  if (!value) {
    throw new Error(`Missing email context key: ${key}`);
  }
  return value;
}

function renderTemplate(templateId: EmailTemplateId, context: Record<string, string>): RenderedTemplate {
  if (templateId === 'admin.leave_request_created') {
    const title = requireContext(context, 'notificationTitle');
    const body = requireContext(context, 'notificationBody');
    const targetUrl = requireContext(context, 'targetUrl');
    const adminName = context.adminName || 'Admin';

    return {
      subject: title,
      text: `${body}\n\nOpen request: ${targetUrl}`,
      html: `
<div style="font-family: Arial, sans-serif; color: #111827;">
  <p>Hello ${adminName},</p>
  <p>${body}</p>
  <p><a href="${targetUrl}">Open leave requests</a></p>
</div>`.trim(),
    };
  }

  throw new Error(`Unsupported email template: ${templateId}`);
}

function toSesSafeTagValue(value: string) {
  const sanitized = value.replace(/[^A-Za-z0-9_.@-]/g, '-').slice(0, 256);
  return sanitized || 'unknown';
}

export async function sendTemplatedEmail(payload: EmailEventPayload) {
  if (!payload.to.length) {
    return { accepted: 0 };
  }

  const recipients = Array.from(
    new Set(payload.to.map(recipient => recipient.email.trim()).filter(Boolean))
  );

  if (!recipients.length) {
    return { accepted: 0 };
  }

  const rendered = renderTemplate(payload.templateId, payload.context);
  const command = new SendEmailCommand({
    Source: getSenderAddress(),
    Destination: {
      ToAddresses: recipients,
    },
    ReplyToAddresses: process.env.AWS_SES_REPLY_TO_EMAIL ? [process.env.AWS_SES_REPLY_TO_EMAIL] : undefined,
    ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET || undefined,
    Message: {
      Subject: { Data: rendered.subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: rendered.html, Charset: 'UTF-8' },
        Text: { Data: rendered.text, Charset: 'UTF-8' },
      },
    },
    Tags: [
      {
        Name: 'template_id',
        Value: payload.templateId,
      },
      {
        Name: 'idempotency_key',
        Value: toSesSafeTagValue(payload.idempotencyKey),
      },
    ],
  });

  await sesClient.send(command);
  return { accepted: recipients.length };
}
