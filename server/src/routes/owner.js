const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const db = require('../config/firebase');
const { sendOtpSms } = require('../services/sms');

 
router.post('/request-otp', async (req, res) => {
    const phone = req.body?.phone;
    if (typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Phone number is required.' });
    }
    try {
        const ownerRef = db.collection('owners').doc('owner');
        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);
        
        const requestResult = await db.runTransaction(async (transaction) => {
            const ownerSnapshot = await transaction.get(ownerRef);
            if (!ownerSnapshot.exists) {
                return { status: 500, error: 'Owner not found.' };
            }
            const ownerData = ownerSnapshot.data();
            if (phone.trim() !== ownerData.phone) {
                return { status: 401, error: 'Invalid phone number.' };
            }

            const now = Date.now();
            const otpRequestedAt = ownerData.otpRequestedAt ?? 0;
            if (now - otpRequestedAt < 60 * 1000) {
                return { status: 429, error: 'Please wait 60 seconds before requesting another OTP.' };
            }

            transaction.update(ownerRef, {
                otpHash: hashedOtp,
                otpExpiresAt: now + 5 * 60 * 1000,
                otpAttempts: 0,
                otpRequestedAt: now
            });
            return { status: 200, phone: ownerData.phone };
        });
        if (requestResult.error) {
            return res.status(requestResult.status).json({ error: requestResult.error });
        }

        try {
            await sendOtpSms(requestResult.phone, otp);
        } catch (smsError) {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(ownerRef);
                if (snapshot.exists && snapshot.data().otpHash === hashedOtp) {
                    transaction.update(ownerRef, {
                        otpHash: null,
                        otpExpiresAt: null,
                        otpAttempts: 0,
                        otpRequestedAt: 0
                    });
                }
            });
            throw smsError;
        }

        return res.status(200).json({ message: 'OTP sent successfully.' });
    } catch (error) {
        console.error('Error requesting OTP:', error);  
        return res.status(500).json({ error: 'Internal server error.' });
    }
});


router.post('/verify-otp', async (req, res) => {
    const phone = req.body?.phone;
    const otp = req.body?.otp;
    
    if (typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (typeof otp !== 'string' || otp.trim() === '') {
        return res.status(400).json({ error: 'OTP is required.' });
    }
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ error: 'OTP must be exactly six digits.' });
    }
    try {
        const ownerRef = db.collection('owners').doc('owner');
        const verificationResult = await db.runTransaction(async (transaction) => {
            const ownerSnapshot = await transaction.get(ownerRef);
            if (!ownerSnapshot.exists) {
                return { status: 500, error: 'Owner not found.' };
            }
            const ownerData = ownerSnapshot.data();
            if (phone.trim() !== ownerData.phone) {
                return { status: 401, error: 'Invalid phone number.' };
            }

            const otpHash = ownerData.otpHash;
            const otpExpiresAt = ownerData.otpExpiresAt;
            const otpAttempts = ownerData.otpAttempts ?? 0;
            if (!otpHash || !otpExpiresAt || Date.now() >= otpExpiresAt) {
                return { status: 400, error: 'OTP has expired or is invalid.' };
            }
            if (otpAttempts >= 5) {
                return { status: 429, error: 'Too many OTP attempts. Please request a new OTP.' };
            }

            const isOtpValid = await bcrypt.compare(otp, otpHash);
            if (!isOtpValid) {
                transaction.update(ownerRef, { otpAttempts: otpAttempts + 1 });
                return { status: 401, error: 'Invalid OTP.' };
            }

            transaction.update(ownerRef, {
                otpHash: null,
                otpExpiresAt: null,
                otpAttempts: 0
            });
            return { status: 200, message: 'OTP verified successfully.' };
        });
        if (verificationResult.error) {
            return res.status(verificationResult.status).json({ error: verificationResult.error });
        }

        return res.status(verificationResult.status).json({ message: verificationResult.message });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;