const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Define secrets
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const secretList = [STRIPE_SECRET_KEY, SMTP_PASSWORD, STRIPE_WEBHOOK_SECRET];

// ============================================
// SMTP2GO EMAIL CONFIGURATION
// ============================================

const createEmailTransporter = () => {
    return nodemailer.createTransporter({
        host: 'mail-au.smtp2go.com',
        port: 2525,
        secure: false,
        auth: {
            user: 'Ice Cream Tracker',
            pass: SMTP_PASSWORD.value()
        }
    });
};

// ============================================
// EMAIL TEMPLATES
// ============================================

const emailTemplates = {
    welcomeTrial: (vendorName) => ({
        subject: '🍦 Welcome to Ice Cream Tracker - 45 Day Free Trial!',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { display: inline-block; background: #FF6B9D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1>🍦 Welcome to Ice Cream Tracker!</h1></div>
                    <div class="content">
                        <p>Hi ${vendorName || 'there'},</p>
                        <p>Thanks for signing up! Your <strong>45-day free trial</strong> has started.</p>
                        <h3>🎁 What you can do during your trial:</h3>
                        <ul>
                            <li>✅ Track your ice cream truck in real-time</li>
                            <li>✅ Appear on the customer-facing map</li>
                        </ul>
                        <p style="text-align: center;">
                            <a href="https://app.icecreamtracker.co.nz/vendor.html" class="button">Get Started</a>
                        </p>
                        <p>Cheers,<br>The Ice Cream Tracker Team</p>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ</p></div>
                </div>
            </body>
            </html>
        `
    }),

    trialExpiring: (vendorName, daysLeft) => ({
        subject: `⏰ Your trial expires in ${daysLeft} days`,
        html: `
            <!DOCTYPE html><html><head><style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #FF6B9D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            </style></head>
            <body><div class="container">
                <div class="header"><h1>⏰ Trial Ending Soon</h1></div>
                <div class="content">
                    <p>Hi ${vendorName || 'there'},</p>
                    <p>Your trial expires in <strong>${daysLeft} days</strong>.</p>
                    <p style="text-align: center;"><a href="https://app.icecreamtracker.co.nz/billing.html" class="button">Upgrade Now</a></p>
                </div>
            </div></body></html>
        `
    }),

    trialExpired: (vendorName) => ({
        subject: '⚠️ Your trial has expired',
        html: `
            <!DOCTYPE html><html><head><style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #f44336 0%, #e57373 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #f44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            </style></head>
            <body><div class="container">
                <div class="header"><h1>⚠️ Trial Expired</h1></div>
                <div class="content">
                    <p>Hi ${vendorName || 'there'},</p>
                    <p>Your trial has ended. Upgrade to continue:</p>
                    <p style="text-align: center;"><a href="https://app.icecreamtracker.co.nz/billing.html" class="button">Choose a Plan</a></p>
                </div>
            </div></body></html>
        `
    }),

    paymentFailed: (vendorName, amount) => ({
        subject: '❌ Payment Failed',
        html: `
            <!DOCTYPE html><html><head><style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #FF9800 0%, #FFB74D 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #FF9800; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            </style></head>
            <body><div class="container">
                <div class="header"><h1>❌ Payment Failed</h1></div>
                <div class="content">
                    <p>Hi ${vendorName || 'there'},</p>
                    <p>We couldn't process your payment of $${amount}.</p>
                    <p style="text-align: center;"><a href="https://app.icecreamtracker.co.nz/billing.html" class="button">Update Payment</a></p>
                </div>
            </div></body></html>
        `
    }),

    subscriptionActivated: (vendorName, plan) => ({
        subject: '🎉 Welcome to Ice Cream Tracker!',
        html: `
            <!DOCTYPE html><html><head><style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            </style></head>
            <body><div class="container">
                <div class="header"><h1>🎉 Welcome!</h1></div>
                <div class="content">
                    <p>Hi ${vendorName || 'there'},</p>
                    <p>Your <strong>${plan || 'subscription'}</strong> is now active!</p>
                    <p style="text-align: center;"><a href="https://app.icecreamtracker.co.nz/vendor.html" class="button">Go to Dashboard</a></p>
                </div>
            </div></body></html>
        `
    }),

    paymentSuccessReceipt: (vendorName, amount, plan, nextBillingDate) => ({
        subject: '✅ Payment received - Ice Cream Tracker',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header img { width: 60px; margin-bottom: 10px; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .receipt-box { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
                    .receipt-row:last-child { border-bottom: none; font-weight: bold; font-size: 16px; }
                    .button { display: inline-block; background: #FF6B9D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="https://assets.cdn.filesafe.space/eh6jrXRnyP8w1TsSmdyM/media/69d8870ad7871cddf7f4a415.png" alt="Ice Cream Tracker" />
                        <h1>Payment Received</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${vendorName || 'there'},</p>
                        <p>Thanks — your payment was successful. Here's your receipt:</p>
                        <div class="receipt-box">
                            <div class="receipt-row"><span>Plan</span><span>${plan || 'Subscription'}</span></div>
                            <div class="receipt-row"><span>Amount paid</span><span>$${amount} NZD</span></div>
                            <div class="receipt-row"><span>Next billing date</span><span>${nextBillingDate}</span></div>
                        </div>
                        <p style="text-align: center;">
                            <a href="https://app.icecreamtracker.co.nz/billing.html" class="button">View Billing</a>
                        </p>
                        <p>Cheers,<br>The Ice Cream Tracker Team</p>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ · <a href="https://app.icecreamtracker.co.nz">app.icecreamtracker.co.nz</a></p></div>
                </div>
            </body>
            </html>
        `
    }),

    subscriptionCancelled: (vendorName, accessEndsDate) => ({
        subject: 'Your Ice Cream Tracker subscription has been cancelled',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header img { width: 60px; margin-bottom: 10px; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .info-box { background: white; border-left: 4px solid #FF6B9D; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
                    .button { display: inline-block; background: #FF6B9D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="https://assets.cdn.filesafe.space/eh6jrXRnyP8w1TsSmdyM/media/69d8870ad7871cddf7f4a415.png" alt="Ice Cream Tracker" />
                        <h1>Subscription Cancelled</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${vendorName || 'there'},</p>
                        <p>We've confirmed your cancellation. You'll still have full access until your current billing period ends.</p>
                        <div class="info-box">
                            <strong>Access ends:</strong> ${accessEndsDate}
                        </div>
                        <p>After that date your listing will be removed from the map. You can resubscribe any time from the billing page.</p>
                        <p style="text-align: center;">
                            <a href="https://app.icecreamtracker.co.nz/billing.html" class="button">Resubscribe</a>
                        </p>
                        <p>Thanks for being part of Ice Cream Tracker NZ.<br>The Ice Cream Tracker Team</p>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ · <a href="https://app.icecreamtracker.co.nz">app.icecreamtracker.co.nz</a></p></div>
                </div>
            </body>
            </html>
        `
    }),

    renewalReminder: (vendorName, plan, amount, renewalDate) => ({
        subject: `Your Ice Cream Tracker subscription renews in 3 days`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header img { width: 60px; margin-bottom: 10px; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .info-box { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
                    .info-row:last-child { border-bottom: none; }
                    .button { display: inline-block; background: #FF6B9D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="https://assets.cdn.filesafe.space/eh6jrXRnyP8w1TsSmdyM/media/69d8870ad7871cddf7f4a415.png" alt="Ice Cream Tracker" />
                        <h1>Renewal Reminder</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${vendorName || 'there'},</p>
                        <p>Just a heads-up — your subscription renews in <strong>3 days</strong>.</p>
                        <div class="info-box">
                            <div class="info-row"><span>Plan</span><span>${plan || 'Subscription'}</span></div>
                            <div class="info-row"><span>Renewal amount</span><span>$${amount} NZD</span></div>
                            <div class="info-row"><span>Renewal date</span><span>${renewalDate}</span></div>
                        </div>
                        <p>No action needed — your subscription will renew automatically. To update payment details or cancel, visit your billing page.</p>
                        <p style="text-align: center;">
                            <a href="https://app.icecreamtracker.co.nz/billing.html" class="button">Manage Billing</a>
                        </p>
                        <p>Cheers,<br>The Ice Cream Tracker Team</p>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ · <a href="https://app.icecreamtracker.co.nz">app.icecreamtracker.co.nz</a></p></div>
                </div>
            </body>
            </html>
        `
    }),

    adminNewSignup: (vendorName, vendorEmail, signupDate) => ({
        subject: `New vendor signup: ${vendorName || vendorEmail}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .info-box { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .info-row { padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
                    .info-row:last-child { border-bottom: none; }
                    .label { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>New Vendor Signup</h1>
                    </div>
                    <div class="content">
                        <p>A new vendor has signed up for Ice Cream Tracker NZ.</p>
                        <div class="info-box">
                            <div class="info-row"><div class="label">Business Name</div><div>${vendorName || '(not set)'}</div></div>
                            <div class="info-row"><div class="label">Email</div><div>${vendorEmail}</div></div>
                            <div class="info-row"><div class="label">Signup Date</div><div>${signupDate}</div></div>
                        </div>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ internal notification</p></div>
                </div>
            </body>
            </html>
        `
    }),

    passwordReset: (resetLink) => ({
        subject: '🔑 Reset your Ice Cream Tracker password',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { display: inline-block; background: #FF6B9D; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 24px 0; font-size: 16px; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                    .note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; font-size: 14px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="https://assets.cdn.filesafe.space/eh6jrXRnyP8w1TsSmdyM/media/69d8870ad7871cddf7f4a415.png" alt="Ice Cream Tracker NZ" style="width:60px;height:60px;border-radius:12px;margin-bottom:12px;">
                        <h1 style="margin:0;font-size:24px;">Reset your password</h1>
                    </div>
                    <div class="content">
                        <p>We received a request to reset your Ice Cream Tracker password. Click the button below to choose a new one:</p>
                        <div style="text-align:center;">
                            <a href="${resetLink}" class="button">Reset My Password</a>
                        </div>
                        <p style="font-size:14px;color:#666;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
                        <div class="note">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break:break-all;color:#2B4C7E;">${resetLink}</span></div>
                    </div>
                    <div class="footer"><p>Ice Cream Tracker NZ · <a href="https://app.icecreamtracker.co.nz" style="color:#FF6B9D;">app.icecreamtracker.co.nz</a></p></div>
                </div>
            </body>
            </html>
        `
    })
};

// ============================================
// SEND EMAIL FUNCTION
// ============================================

async function sendEmail(to, template) {
    const transporter = createEmailTransporter();
    const mailOptions = {
        from: '"Ice Cream Tracker NZ" <noreply@icecreamtracker.co.nz>',
        to: to,
        subject: template.subject,
        html: template.html
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// 1. CREATE CHECKOUT SESSION
// ============================================
exports.createCheckoutSession = onRequest({ secrets: secretList }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    try {
        const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
        const { priceId, vendorId, successUrl, cancelUrl } = req.body;

        const vendorDoc = await db.collection('vendors').doc(vendorId).get();
        if (!vendorDoc.exists) { res.status(404).json({ error: 'Vendor not found' }); return; }

        const vendor = vendorDoc.data();
        let customerId = vendor.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: vendor.email,
                metadata: { vendorId, businessName: vendor.businessName || '' }
            });
            customerId = customer.id;
            await db.collection('vendors').doc(vendorId).update({
                stripeCustomerId: customerId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: { vendorId },
            subscription_data: { metadata: { vendorId } }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 2. CREATE CUSTOMER PORTAL SESSION
// ============================================
exports.createPortalSession = onRequest({ secrets: secretList }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    try {
        const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
        const { customerId, returnUrl } = req.body;
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 3. CANCEL SUBSCRIPTION
// ============================================
exports.cancelSubscription = onRequest({ secrets: secretList }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    try {
        const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
        const { vendorId, subscriptionId } = req.body;
        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        await db.collection('vendors').doc(vendorId).update({
            cancelAtPeriodEnd: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 4. STRIPE WEBHOOK HANDLER
// ============================================
exports.stripeWebhook = onRequest({ secrets: secretList }, async (req, res) => {
    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    const sig = req.headers['stripe-signature'];
    const webhookSecret = STRIPE_WEBHOOK_SECRET.value();

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(event.data.object, stripe); break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object); break;
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object); break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object); break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        return res.json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: error.message });
    }
});

// ============================================
// WEBHOOK HELPER FUNCTIONS
// ============================================

const PRICE_ID_TO_PLAN = {
    'price_1TLbF1ENy8glkcQKz2MXuU5K': 'starter',
    'price_1TLbFSENy8glkcQKmfcCVJbe': 'professional',
    'price_1TLbFqENy8glkcQKkiDAajyB': 'enterprise'
};

async function handleSubscriptionUpdate(subscription, stripe) {
    const vendorId = subscription.metadata.vendorId;
    if (!vendorId) { console.error('No vendorId in subscription metadata'); return; }

    const priceId = subscription.items.data[0].price.id;
    const price = await stripe.prices.retrieve(priceId);
    const plan = price.metadata.plan || PRICE_ID_TO_PLAN[priceId] || 'unknown';

    await db.collection('vendors').doc(vendorId).update({
        subscriptionStatus: subscription.status,
        subscriptionPlan: plan,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (subscription.status === 'active') {
        const vendorDoc = await db.collection('vendors').doc(vendorId).get();
        const vendor = vendorDoc.data();
        const planNames = { starter: 'Starter Plan', professional: 'Professional Plan', enterprise: 'Enterprise Plan' };
        await sendEmail(vendor.email, emailTemplates.subscriptionActivated(vendor.businessName, planNames[plan]));
        console.log(`Subscription activated email sent to ${vendor.email}`);
    }
    console.log(`Subscription updated for vendor ${vendorId}: ${plan} (${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription) {
    const vendorId = subscription.metadata.vendorId;
    if (!vendorId) return;
    const accessEndsDate = new Date(subscription.current_period_end * 1000)
        .toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
    await db.collection('vendors').doc(vendorId).update({
        subscriptionStatus: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const vendorDoc = await db.collection('vendors').doc(vendorId).get();
    const vendor = vendorDoc.data();
    await sendEmail(vendor.email, emailTemplates.subscriptionCancelled(vendor.businessName, accessEndsDate));
    console.log(`Subscription cancelled email sent to ${vendor.email}`);
}

async function handlePaymentSucceeded(invoice) {
    const customerId = invoice.customer;
    const vendorQuery = await db.collection('vendors').where('stripeCustomerId', '==', customerId).limit(1).get();
    if (vendorQuery.empty) return;
    const vendorDoc = vendorQuery.docs[0];
    const vendor = vendorDoc.data();
    const amount = (invoice.amount_paid / 100).toFixed(2);
    const plan = PRICE_ID_TO_PLAN[invoice.lines?.data?.[0]?.price?.id] || vendor.subscriptionPlan || 'Subscription';
    const planNames = { starter: 'Starter Plan', professional: 'Professional Plan', enterprise: 'Enterprise Plan' };
    const planLabel = planNames[plan] || plan;
    const nextBillingDate = vendor.currentPeriodEnd
        ? vendor.currentPeriodEnd.toDate().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'your next billing date';
    await vendorDoc.ref.update({
        lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentAmount: invoice.amount_paid / 100,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendEmail(vendor.email, emailTemplates.paymentSuccessReceipt(vendor.businessName, amount, planLabel, nextBillingDate));
    console.log(`Payment receipt email sent to ${vendor.email}`);
}

async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const vendorQuery = await db.collection('vendors').where('stripeCustomerId', '==', customerId).limit(1).get();
    if (vendorQuery.empty) return;
    const vendorDoc = vendorQuery.docs[0];
    const vendor = vendorDoc.data();
    await vendorDoc.ref.update({
        paymentFailed: true,
        lastPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const amount = (invoice.amount_due / 100).toFixed(2);
    await sendEmail(vendor.email, emailTemplates.paymentFailed(vendor.businessName, amount));
    console.log(`Payment failed email sent to ${vendor.email}`);
}

// ============================================
// 5. DAILY TRIAL EXPIRY CHECK
// ============================================
exports.checkExpiredTrials = onSchedule({ schedule: '0 0 * * *', timeZone: 'Pacific/Auckland', secrets: secretList }, async (event) => {
    const now = admin.firestore.Timestamp.now();
    const expiredTrials = await db.collection('vendors')
        .where('subscriptionStatus', '==', 'trial')
        .where('trialEndsAt', '<=', now)
        .get();

    const batch = db.batch();
    for (const doc of expiredTrials.docs) {
        const vendor = doc.data();
        batch.update(doc.ref, { subscriptionStatus: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await sendEmail(vendor.email, emailTemplates.trialExpired(vendor.businessName));
        console.log(`Trial expired email sent to ${vendor.email}`);
    }
    await batch.commit();
    console.log(`Expired ${expiredTrials.size} trial accounts`);
});

// ============================================
// 6. TRIAL EXPIRING REMINDERS
// ============================================
exports.sendTrialReminders = onSchedule({ schedule: '0 9 * * *', timeZone: 'Pacific/Auckland', secrets: secretList }, async (event) => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    const oneDayFromNow = new Date(now.getTime() + (1 * 24 * 60 * 60 * 1000));

    const trialVendors = await db.collection('vendors').where('subscriptionStatus', '==', 'trial').get();

    for (const doc of trialVendors.docs) {
        const vendor = doc.data();
        const trialEnd = vendor.trialEndsAt.toDate();
        let daysLeft = null;

        if (Math.abs(trialEnd - sevenDaysFromNow) < (24 * 60 * 60 * 1000)) daysLeft = 7;
        else if (Math.abs(trialEnd - threeDaysFromNow) < (24 * 60 * 60 * 1000)) daysLeft = 3;
        else if (Math.abs(trialEnd - oneDayFromNow) < (24 * 60 * 60 * 1000)) daysLeft = 1;

        if (daysLeft) {
            await sendEmail(vendor.email, emailTemplates.trialExpiring(vendor.businessName, daysLeft));
            console.log(`Trial expiring (${daysLeft} days) email sent to ${vendor.email}`);
        }
    }
});

// ============================================
// 7. RENEWAL REMINDERS (3 days before next billing)
// ============================================
exports.sendRenewalReminders = onSchedule({ schedule: '0 9 * * *', timeZone: 'Pacific/Auckland', secrets: secretList }, async (event) => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    const windowStart = admin.firestore.Timestamp.fromMillis(threeDaysFromNow.getTime() - (12 * 60 * 60 * 1000));
    const windowEnd = admin.firestore.Timestamp.fromMillis(threeDaysFromNow.getTime() + (12 * 60 * 60 * 1000));

    const activeVendors = await db.collection('vendors')
        .where('subscriptionStatus', '==', 'active')
        .where('currentPeriodEnd', '>=', windowStart)
        .where('currentPeriodEnd', '<=', windowEnd)
        .get();

    const planNames = { starter: 'Starter Plan', professional: 'Professional Plan', enterprise: 'Enterprise Plan' };
    const planAmounts = { starter: '29.00', professional: '49.00', enterprise: '99.00' };

    for (const doc of activeVendors.docs) {
        const vendor = doc.data();
        const renewalDate = vendor.currentPeriodEnd.toDate()
            .toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
        const planLabel = planNames[vendor.subscriptionPlan] || vendor.subscriptionPlan || 'Subscription';
        const amount = planAmounts[vendor.subscriptionPlan] || '—';
        await sendEmail(vendor.email, emailTemplates.renewalReminder(vendor.businessName, planLabel, amount, renewalDate));
        console.log(`Renewal reminder sent to ${vendor.email}`);
    }
    console.log(`Sent ${activeVendors.size} renewal reminder(s)`);
});

// ============================================
// 8. SEND WELCOME EMAIL + ADMIN ALERT ON VENDOR DOCUMENT CREATION
// ============================================
exports.onVendorCreated = onDocumentCreated(
    { document: 'vendors/{vendorId}', secrets: secretList },
    async (event) => {
        const vendor = event.data.data();
        if (!vendor?.email) return;

        const signupDate = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });

        await Promise.all([
            sendEmail(vendor.email, emailTemplates.welcomeTrial(vendor.businessName)),
            sendEmail('sam@onepost.co.nz', emailTemplates.adminNewSignup(vendor.businessName, vendor.email, signupDate))
        ]);

        console.log(`Welcome email sent to ${vendor.email}, admin notified`);
    }
);

// ============================================
// 9. SEND PASSWORD RESET EMAIL VIA SMTP2GO
// ============================================
exports.sendPasswordReset = onRequest({ secrets: secretList }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email required' }); return; }

    try {
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        await sendEmail(email, emailTemplates.passwordReset(resetLink));
        console.log(`Password reset email sent to ${email}`);
    } catch (error) {
        // Log the error but always return success to avoid revealing whether an email is registered
        console.error('Password reset error:', error.message);
    }

    res.json({ success: true });
});
