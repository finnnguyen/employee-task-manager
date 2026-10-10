const nodemailer = require('nodemailer');
const emailMode = process.env.EMAIL_MODE || 'smtp';

if (emailMode === 'console' && process.env.NODE_ENV === 'production') {
    throw new Error('Email mode is disabled in production.');
}

if (![ 'console', 'smtp' ].includes(emailMode)) {
    throw new Error(`Invalid email mode`);
}

async function sendEmployeeInvite(email, name, inviteUrl) {
    if (emailMode === 'console') {
        console.log(`[LOCAL EMAIL TEST] Invitation for ${name}: ${inviteUrl}`);
        return {status: "simulated"};
    }

    throw new Error('SMTP email sending not implemented yet.');
}

module.exports = {
    sendEmployeeInvite
};