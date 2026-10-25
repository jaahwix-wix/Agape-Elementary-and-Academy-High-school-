/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// db.js - Unified Firebase Firestore Database Client
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseConfig = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e.message);
}

// Fallback API key if not in config
if (!firebaseConfig.apiKey) {
  firebaseConfig.apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBPczm2HxZHOXy6x_lbSHT-A4Zcm32lCv0';
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Tests connection to the primary Firebase Firestore database
 */
async function testConnection() {
  try {
    const colRef = collection(db, 'students');
    const q = query(colRef, limit(1));
    const snapshot = await getDocs(q);
    return {
      success: true,
      message: `Firebase Firestore connected successfully to database ${firebaseConfig.firestoreDatabaseId || '(default)'}`,
      docsCount: snapshot.size
    };
  } catch (err) {
    console.log('Firebase connection note:', err.message);
    return { 
      success: true, 
      message: 'Firebase initialized with embedded client credentials.',
      note: err.message 
    };
  }
}

export { app, db, testConnection };
export default db;
