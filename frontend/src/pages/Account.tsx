import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import {
  fetchUserPreferences,
  updateUserPreferences,
  clearUserActivity,
  type Preferences,
} from '../api/auth'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function Account() {
  const { user, logout, changePassword, deleteAccount } = useAuthStore()
  const navigate = useNavigate()

  // Preferences state
  const [preferences, setPreferences] = useState<Preferences>({
    favorite_categories: [],
    budget_min: null,
    budget_max: null,
    personalization_paused: false,
  })
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [activityCleared, setActivityCleared] = useState(false)

  // Password change state
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')

  // Delete account state
  const [deletePass, setDeletePass] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    fetchUserPreferences()
      .then((p) => {
        setPreferences(p)
      })
      .catch(() => {})
      .finally(() => {
        setPrefsLoading(false)
      })
  }, [user, navigate])

  if (!user) {
    return null
  }

  const handleTogglePersonalization = async () => {
    const nextPaused = !preferences.personalization_paused
    setPreferences((prev) => ({ ...prev, personalization_paused: nextPaused }))
    try {
      await updateUserPreferences({ personalization_paused: nextPaused })
    } catch {
      // Revert on failure
      setPreferences((prev) => ({ ...prev, personalization_paused: !nextPaused }))
    }
  }

  const handleClearActivity = async () => {
    if (!window.confirm('Are you sure you want to clear your browsing and search activity?')) {
      return
    }
    try {
      await clearUserActivity()
      setActivityCleared(true)
      setTimeout(() => setActivityCleared(false), 3000)
    } catch {
      // ignore
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess('')

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwdError('Please fill in all password fields.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdError("New passwords don't match.")
      return
    }
    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters.')
      return
    }

    setPwdLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      setPwdSuccess('Password updated successfully.')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPwdError(err.message || 'Incorrect current password.')
    } finally {
      setPwdLoading(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleteError('')

    if (!deletePass) {
      setDeleteError('Please enter your password to confirm deletion.')
      return
    }

    setDeleteLoading(true)
    try {
      await deleteAccount(deletePass)
      navigate('/')
    } catch (err: any) {
      setDeleteError(err.message || 'Incorrect password.')
      setDeleteLoading(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '3rem 1.5rem',
        fontFamily: 'var(--font-body, Manrope, sans-serif)',
      }}
    >
      <div style={{ marginBottom: '2rem' }}>
        <h1
          className="font-display"
          style={{
            fontSize: '2rem',
            fontWeight: 400,
            color: 'var(--text-h, #111827)',
            marginBottom: '0.5rem',
          }}
        >
          Account & Preferences
        </h1>
        <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.875rem' }}>
          Manage your personal details, privacy settings, and security.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Section 1: User Profile */}
        <div
          style={{
            border: '1px solid var(--line, #e5e7eb)',
            borderRadius: 'var(--r-lg, 12px)',
            padding: '1.5rem',
            backgroundColor: 'var(--card, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase' }}>
                Signed In As
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-h, #111827)', marginTop: '4px' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted, #6b7280)' }}>
                {user.email}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout()
                navigate('/')
              }}
            >
              SIGN OUT
            </Button>
          </div>
        </div>

        {/* Section 2: Personalization & Privacy */}
        <div
          style={{
            border: '1px solid var(--line, #e5e7eb)',
            borderRadius: 'var(--r-lg, 12px)',
            padding: '1.5rem',
            backgroundColor: 'var(--card, #ffffff)',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-h, #111827)', marginBottom: '1rem' }}>
            Personalization & Privacy
          </h2>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--line, #e5e7eb)' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-h, #111827)' }}>
                Pause personalization
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
                When paused, your product views and search actions are not logged to recommendations.
              </div>
            </div>
            <label htmlFor="pref-pause" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                id="pref-pause"
                type="checkbox"
                aria-label="Pause personalization"
                checked={preferences.personalization_paused}
                onChange={handleTogglePersonalization}
                disabled={prefsLoading}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--ink-900, #111827)' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-h, #111827)' }}>
                Activity history
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
                Clear previously recorded product views, searches, and assistant runs.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activityCleared && (
                <span style={{ fontSize: '0.8rem', color: 'var(--verdict-buy, #15803d)' }}>
                  Cleared
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleClearActivity}>
                CLEAR MY ACTIVITY
              </Button>
            </div>
          </div>
        </div>

        {/* Section 3: Change Password */}
        <div
          style={{
            border: '1px solid var(--line, #e5e7eb)',
            borderRadius: 'var(--r-lg, 12px)',
            padding: '1.5rem',
            backgroundColor: 'var(--card, #ffffff)',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-h, #111827)', marginBottom: '1rem' }}>
            Change Password
          </h2>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Input
              id="account-old-pwd"
              label="CURRENT PASSWORD"
              type="password"
              placeholder="Enter current password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              id="account-new-pwd"
              label="NEW PASSWORD"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              id="account-confirm-pwd"
              label="CONFIRM NEW PASSWORD"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            {pwdError && (
              <p role="alert" style={{ color: 'var(--verdict-wait, #b91c1c)', fontSize: '0.82rem', margin: '4px 0' }}>
                {pwdError}
              </p>
            )}
            {pwdSuccess && (
              <p role="status" style={{ color: 'var(--verdict-buy, #15803d)', fontSize: '0.82rem', margin: '4px 0' }}>
                {pwdSuccess}
              </p>
            )}

            <div style={{ marginTop: '8px' }}>
              <Button type="submit" variant="primary-light" disabled={pwdLoading} size="md">
                {pwdLoading ? 'Updating…' : 'UPDATE PASSWORD'}
              </Button>
            </div>
          </form>
        </div>

        {/* Section 4: Delete Account */}
        <div
          style={{
            border: '1px solid var(--line, #e5e7eb)',
            borderRadius: 'var(--r-lg, 12px)',
            padding: '1.5rem',
            backgroundColor: 'var(--card, #ffffff)',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--verdict-wait, #b91c1c)', marginBottom: '0.5rem' }}>
            Delete Account
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)', marginBottom: '1rem' }}>
            Permanently delete your account and all associated data, including active price alerts, cart items, saved items, and purchase history. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              style={{ color: 'var(--verdict-wait, #b91c1c)', borderColor: 'var(--verdict-wait, #b91c1c)' }}
              onClick={() => setShowDeleteConfirm(true)}
            >
              DELETE ACCOUNT
            </Button>
          ) : (
            <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Input
                id="account-delete-pwd"
                label="CONFIRM PASSWORD TO DELETE"
                type="password"
                placeholder="Enter password"
                value={deletePass}
                onChange={(e) => setDeletePass(e.target.value)}
                autoComplete="current-password"
                required
              />
              {deleteError && (
                <p role="alert" style={{ color: 'var(--verdict-wait, #b91c1c)', fontSize: '0.82rem' }}>
                  {deleteError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Button
                  type="submit"
                  disabled={deleteLoading}
                  size="sm"
                  style={{ backgroundColor: 'var(--verdict-wait, #b91c1c)', color: '#ffffff', border: 'none' }}
                >
                  {deleteLoading ? 'Deleting…' : 'CONFIRM DELETE'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeletePass('')
                    setDeleteError('')
                  }}
                >
                  CANCEL
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
