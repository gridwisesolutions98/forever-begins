// Sends a real email to the site owner whenever a new vendor signs up, so
// they don't have to remember to check the admin dashboard's Vendor
// Applications panel. The Gmail App Password used to send it lives only in
// Cloud Secret Manager (set via `firebase functions:secrets:set`), never in
// this repo.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');

const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const SENDER_EMAIL = 'gridwisesolutions.lb@gmail.com';
const ALERT_RECIPIENT = 'gridwisesolutions.lb@gmail.com';

exports.notifyNewVendor = onDocumentCreated(
  { document: 'vendors/{username}', secrets: [gmailAppPassword] },
  async (event) => {
    const vendor = event.data.data();
    const username = event.params.username;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SENDER_EMAIL, pass: gmailAppPassword.value() },
    });

    await transporter.sendMail({
      from: `Forever Begins <${SENDER_EMAIL}>`,
      to: ALERT_RECIPIENT,
      subject: `New vendor application: ${vendor.businessName || username}`,
      text: [
        'A new vendor just signed up on Forever Begins:',
        '',
        `Business: ${vendor.businessName || ''}`,
        `Category: ${vendor.category || ''}`,
        `Username: ${username}`,
        `Email: ${vendor.email || ''}`,
        `Phone: ${vendor.phone || ''}`,
        `Plan: ${vendor.plan || ''}`,
        `Payment method: ${vendor.paymentMethod || ''}`,
        `Transaction ref: ${vendor.transactionRef || ''}`,
        '',
        'Review and approve it here: https://foreverbegins.pro/admin.html',
      ].join('\n'),
    });
  }
);
