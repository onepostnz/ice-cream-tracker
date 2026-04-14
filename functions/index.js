const { onRequest } = require('firebase-functions/v2/https');
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { beforeUserCreated } = require('firebase-functions/v2/identity');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Define secrets
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const SMTP_USERNAME = defineSecret('SMTP_USERNAME');
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const secretList = [STRIPE_SECRET_KEY, SMTP_USERNAME, SMTP_PASSWORD, STRIPE_WEBHOOK_SECRET];

// ============================================
// SMTP2GO EMAIL CONFIGURATION
// ============================================

const createEmailTransporter = () => {
    return nodemailer.createTransporter({
        host: 'mail.smtp2go.com',
        port: 2525,
        secure: false,
        auth: {
            user: SMTP_USERNAME.value(),
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
    await db.collection('vendors').doc(vendorId).update({
        subscriptionStatus: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Subscription cancelled for vendor ${vendorId}`);
}

async function handlePaymentSucceeded(invoice) {
    const customerId = invoice.customer;
    const vendorQuery = await db.collection('vendors').where('stripeCustomerId', '==', customerId).limit(1).get();
    if (vendorQuery.empty) return;
    await vendorQuery.docs[0].ref.update({
        lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentAmount: invoice.amount_paid / 100,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Payment succeeded for customer ${customerId}`);
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
// 7. AUTO-CREATE VENDOR ON SIGNUP
// ============================================
exports.onUserCreate = onRequest({ secrets: secretList }, async (req, res) => {
    // This is triggered via Auth trigger - keeping as onRequest for v2 compatibility
    const user = req.body;
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + (45 * 24 * 60 * 60 * 1000));

    await db.collection('vendors').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        subscriptionStatus: 'trial',
        trialStartedAt: admin.firestore.Timestamp.fromDate(trialStart),
        trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
        truckCount: 0,
        eventCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await sendEmail(user.email, emailTemplates.welcomeTrial());
    console.log(`Created vendor document and sent welcome email for ${user.email}`);
    res.json({ success: true });
});
