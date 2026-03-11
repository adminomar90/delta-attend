import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const transporter = (() => {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
})();

const sendOrLog = async ({ to, subject, text }) => {
  if (!to) {
    return;
  }

  if (!transporter) {
    console.log(`[email-mock] to=${to} subject="${subject}" text="${text}"`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom || env.smtpUser,
    to,
    subject,
    text,
  });
};

export const emailService = {
  async sendTaskAssignment({ to, taskTitle }) {
    return sendOrLog({
      to,
      subject: 'Delta Plus - New Task Assignment',
      text: `You have been assigned a new task: ${taskTitle}`,
    });
  },

  async sendTaskApprovalProgress({ to, taskTitle, current, required }) {
    return sendOrLog({
      to,
      subject: 'Delta Plus - Task Approval Progress',
      text: `Task "${taskTitle}" received approval ${current}/${required}.`,
    });
  },

  async sendTaskApproved({ to, taskTitle, points }) {
    return sendOrLog({
      to,
      subject: 'Delta Plus - Task Approved',
      text: `Task "${taskTitle}" has been approved. Points granted: ${points}.`,
    });
  },

  async sendOtpCode({ to, code }) {
    return sendOrLog({
      to,
      subject: 'Delta Plus - Login Verification Code',
      text: `Your one-time login code is: ${code}. It will expire in 10 minutes.`,
    });
  },

  async sendPasswordReset({ to, temporaryPassword }) {
    return sendOrLog({
      to,
      subject: 'Delta Plus - Password Reset',
      text: `Your password has been reset. Temporary password: ${temporaryPassword}`,
    });
  },
};
