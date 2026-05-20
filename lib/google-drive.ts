const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY!
const BACKUP_FOLDER_NAME = 'SwipeSaaS Backups'
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gapi: any
  }
}

let gapiLoaded = false
let gapiLoading = false

export const loadGoogleAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve()
    if (gapiLoaded) return resolve()
    if (gapiLoading) {
      const interval = setInterval(() => {
        if (gapiLoaded) { clearInterval(interval); resolve() }
      }, 100)
      return
    }
    gapiLoading = true

    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            clientId: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          })
          gapiLoaded = true
          gapiLoading = false
          resolve()
        } catch (err) {
          gapiLoading = false
          reject(err)
        }
      })
    }
    script.onerror = () => { gapiLoading = false; reject(new Error('Failed to load Google API script')) }
    document.head.appendChild(script)
  })
}

export const isGoogleSignedIn = (): boolean => {
  try {
    return window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get() ?? false
  } catch {
    return false
  }
}

export const signInToGoogle = async (): Promise<boolean> => {
  try {
    const authInstance = window.gapi.auth2.getAuthInstance()
    if (!authInstance.isSignedIn.get()) {
      await authInstance.signIn()
    }
    return authInstance.isSignedIn.get()
  } catch (err) {
    console.error('Google sign in error:', err)
    return false
  }
}

export const signOutOfGoogle = (): void => {
  try {
    window.gapi?.auth2?.getAuthInstance()?.signOut()
  } catch { /* ignore */ }
}

const getOrCreateBackupFolder = async (): Promise<string> => {
  const response = await window.gapi.client.drive.files.list({
    q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  })

  if (response.result.files.length > 0) {
    return response.result.files[0].id
  }

  const folder = await window.gapi.client.drive.files.create({
    resource: {
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })

  return folder.result.id
}

export const uploadToGoogleDrive = async (
  jsonString: string,
  filename: string
): Promise<{ id: string; url: string } | null> => {
  try {
    const folderId = await getOrCreateBackupFolder()

    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json',
    }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([jsonString], { type: 'application/json' }))

    const accessToken = window.gapi.auth2
      .getAuthInstance()
      .currentUser.get()
      .getAuthResponse().access_token

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    )

    const data = await response.json()
    if (!data.id) throw new Error(data.error?.message || 'Upload failed')
    console.log('Uploaded to Google Drive:', data.id)
    return { id: data.id, url: data.webViewLink }
  } catch (err) {
    console.error('Google Drive upload error:', err)
    return null
  }
}

export const isGoogleAPIConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
