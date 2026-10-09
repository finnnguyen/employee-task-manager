require('dotenv').config();
const { sendOtpSms } = require('../src/services/sms');

const ownerPhone = process.env.OWNER_PHONE;
if (!ownerPhone) {
	throw new Error('OWNER_PHONE is missing.');
}

async function testSms() {
    try {
        const otp = '123456'; 
        const result = await sendOtpSms(ownerPhone, otp);
        console.log('SMS test result:', {
            sid: result.sid,
            status: result.status,
        });
    } catch (error) {
        console.error('Error sending SMS:', error);
        process.exitCode = 1;
    }
}

testSms();

