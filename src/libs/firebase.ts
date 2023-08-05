import admin from 'firebase-admin'
import { initializeApp, ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

try {
    const cred = Buffer.from(process.env.FIREBASE ?? '', 'base64').toString('utf-8')
    const serviceAccountJSON = JSON.parse(cred)
    const serviceAccount: ServiceAccount = {
        projectId: serviceAccountJSON['project_id'],
        privateKey: serviceAccountJSON['private_key'],
        clientEmail: serviceAccountJSON['client_email']
    }

    initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.BUCKET_NAME
    })
} catch(e) {
    console.log(e)
    console.log('[FIREBASE] Service account credentials required!')    
}

export const db = getFirestore()
export const storage = getStorage()
