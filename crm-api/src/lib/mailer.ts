import nodemailer from 'nodemailer'

import { config } from '../config.js'

const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465,
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
})

export type Mail = { to: string; subject: string; text: string; html?: string }

export const sendMail = (mail: Mail) => transport.sendMail({ from: config.MAIL_FROM, ...mail })
