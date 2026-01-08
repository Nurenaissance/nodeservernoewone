import crypto from 'crypto';

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getIndianCurrentTime() {
  const current_time = new Date();
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  };
  const indiaTime = new Intl.DateTimeFormat('en-GB', options).format(current_time);
  return indiaTime
}

export async function convertToValidDateFormat(dateString) {
  // Check if the input matches the format "DD/MM/YYYY, HH:MM:SS.MS"
  const regex = /(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const match = dateString.match(regex);

  if (!match) {
    throw new Error("Invalid date format");
  }

  // Extract components from the matched regex
  const day = match[1];
  const month = match[2];
  const year = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  const millisecond = match[7];

  // Construct a new formatted date string in "YYYY-MM-DD HH:MM:SS.MMMMMM" format
  const formattedDate = `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond.padEnd(6, '0')}`;

  return formattedDate;
}

export function isRequestSignatureValid(req) {
  const APP_SECRET = process.env.APP_SECRET;
  if (!APP_SECRET) {
    console.warn("App Secret is not set up. Please Add your app secret in /.env file to check for request validation");
    return true;
  }
  const signatureHeader = req.get("x-hub-signature-256");
  const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "utf-8");
  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest('hex');
  const digestBuffer = Buffer.from(digestString, "utf-8");
  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}

export async function clearInactiveSessions() {
  const { userSessions } = await import('./server.js');
  const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

  // Use sessionManager's built-in cleanup method
  if (userSessions.cleanupInactiveSessions) {
    await userSessions.cleanupInactiveSessions(inactivityThreshold);
  } else {
    // Fallback for backward compatibility
    const now = Date.now();
    const entries = await userSessions.entries();
    for (const [userPhoneNumber, session] of entries) {
      if (session.lastActivityTime && (now - session.lastActivityTime > inactivityThreshold)) {
        await userSessions.delete(userPhoneNumber);
      }
    }
  }
}

export const chooseOptionMap = {
  'hi': 'विकल्प चुनें', // Hindi
  'en': 'Choose Option', // English
  'mr': 'पर्याय निवडा', // Marathi
  'ta': 'விருப்பத்தைத் தேர்ந்தெடுக்கவும்', // Tamil
  'te': 'ఎంపికను ఎంచుకోండి', // Telugu
  'gu': 'વિકલ્પ પસંદ કરો', // Gujarati
  'bn': 'বিকল্প নির্বাচন করুন', // Bengali
  'pa': 'ਵਿਕਲਪ ਚੁਣੋ', // Punjabi
  'ml': 'ഓപ്ഷൻ തിരഞ്ഞെടുക്കുക', // Malayalam
  'kn': 'ಆಯ್ಕೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ', // Kannada
  'or': 'ବିକଳ୍ପ ଚୟନ କରନ୍ତୁ', // Odia
  'as': 'বিকল্প বাচনি কৰক', // Assamese
  'ks': 'آپشن منتخب کریں', // Kashmiri
  'ur': 'آپشن منتخب کریں', // Urdu
  'ne': 'विकल्प छान्नुहोस्', // Nepali
  'sa': 'विकल्पं चुनोतु', // Sanskrit
  'mai': 'विकल्प चुनू', // Maithili
  'doi': 'विकल्प चुनो', // Dogri
  'kok': 'पर्याय निवडा', // Konkani
  'bodo': 'अभिराम सन्थार', // Bodo
  'sd': 'چونڊ جو آپشن', // Sindhi
  'mni': 'অপশন নির্বাচন করুন', // Manipuri
  'sat': 'ᱥᱟᱹᱵᱟᱭ ᱢᱤᱭᱤᱭ ᱵᱤᱦᱤᱭ', // Santhali
  'bho': 'विकल्प चुनीं', // Bhojpuri
  'hing': 'Choose Option', // Hinglish
};
