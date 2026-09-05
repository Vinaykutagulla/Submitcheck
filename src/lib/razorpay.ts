import Razorpay from 'razorpay';

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export const razorpayConfig = {
  perManuscript: {
    amount: 49900,
    currency: 'INR',
    description: 'SubmitCheck per-manuscript unlock',
  },
  authorPro: {
    amount: 29900,
    currency: 'INR',
    interval: 'monthly',
    description: 'SubmitCheck Author Pro',
  },
};
