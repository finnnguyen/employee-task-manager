require('dotenv').config();
const db = require('../src/config/firebase');

const ownerPhone = process.env.OWNER_PHONE;
if (!ownerPhone) { 
  console.error('OWNER_PHONE is not defined in the environment variables.');
  process.exit(1);
}

const ownerData = {
  phone: ownerPhone,
  role: 'owner'
};

async function seedOwner() {
    const ownerRef = db.collection('owners').doc('owner');
    const ownerSnapshot = await ownerRef.get();
    if (!ownerSnapshot.exists) { 
        await ownerRef.set(ownerData);
        console.log('Owner seeded successfully.');
    }
    else {
        console.log('Owner already exists.');
    }
}

seedOwner().catch((error) => {
    console.error('Failed seeding owner:', error);
    process.exitCode = 1;
});
