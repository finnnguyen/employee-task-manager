const twilio = require('twilio');
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const smsMode = process.env.SMS_MODE || 'twilio';

if (smsMode === 'console' && process.env.NODE_ENV === 'production') {
    throw new Error('Console SMS mode is disabled in production.');
}

if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    throw new Error('Missing Twilio environment variables.');
}
const client = twilio(twilioAccountSid, twilioAuthToken);

async function sendOtpSms(phone, otp) {
    if (smsMode === 'console') {
        console.log(`[LOCAL SMS TEST] OTP: ${otp}`);
        return { sid: 'local-test', status: 'simulated' };
    }
    const messageData = await client.messages.create({
        to: phone,
        from: twilioPhoneNumber,
        body: `Your OTP is: ${otp}`,
    });
    return messageData;
}

module.exports = {
    sendOtpSms,
};
