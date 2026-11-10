import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Trash2,
  Mail,
  Smartphone,
  Send,
  Sparkles,
  ShieldCheck,
  LogIn,
} from 'lucide-react'
import { formatINR } from '../../lib/format'
import { useToastStore } from '../ui/Toast'
import { useAuthStore } from '../../store/auth'
import {
  createAlert,
  getAlerts,
  deleteAlert,
  sendPhoneOtp,
  verifyPhoneOtp,
  type PriceAlert,
} from '../../api/alerts'

interface Props {
  productId: string
  productTitle: string
  currentPrice: number
  lowestPrice: number
}

type ChannelType = 'email' | 'sms' | 'telegram'

export default function PriceAlertSection({
  productId,
  currentPrice,
}: Props) {
  const user = useAuthStore((s) => s.user)
  const showToast = useToastStore((s) => s.showToast)

  // Toggle states
  const [notifyGoodTime, setNotifyGoodTime] = useState<boolean>(true)
  const [notifyTargetPrice, setNotifyTargetPrice] = useState<boolean>(true)
  const [targetPrice, setTargetPrice] = useState<string>(
    String(Math.round(currentPrice * 0.95))
  )

  // Channel & Destination
  const [channel, setChannel] = useState<ChannelType>('email')
  const [email, setEmail] = useState<string>(user?.email || '')
  const [phone, setPhone] = useState<string>('')
  const [telegramId, setTelegramId] = useState<string>('')

  // Phone OTP verification flow
  const [otpSent, setOtpSent] = useState<boolean>(false)
  const [otpCode, setOtpCode] = useState<string>('')
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false)
  const [sendingOtp, setSendingOtp] = useState<boolean>(false)
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false)
  const [otpDevHint, setOtpDevHint] = useState<string>('')

  // Active alerts list
  const [activeAlerts, setActiveAlerts] = useState<PriceAlert[]>([])
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Keep email synced if user changes
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email)
    }
  }, [user?.email, email])

  // Load existing alerts for this product
  const loadAlerts = async () => {
    if (!user?.email) return
    try {
      const list = await getAlerts(user.email, productId)
      setActiveAlerts(list)
    } catch {
      // Ignore initial fetch errors
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [user?.email, productId])

  // Handle OTP Send
  async function handleSendOtp() {
    const cleanPhone = phone.trim()
    if (!cleanPhone || cleanPhone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number')
      return
    }
    setSendingOtp(true)
    setOtpDevHint('')
    try {
      const res = await sendPhoneOtp(cleanPhone)
      setOtpSent(true)
      showToast('OTP sent successfully to ' + cleanPhone)
      if (res.code) {
        setOtpDevHint(`Code for testing: ${res.code}`)
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send OTP')
    } finally {
      setSendingOtp(false)
    }
  }

  // Handle OTP Verify
  async function handleVerifyOtp() {
    const cleanCode = otpCode.trim()
    if (!cleanCode || cleanCode.length !== 6) {
      showToast('Please enter the 6-digit OTP')
      return
    }
    setVerifyingOtp(true)
    try {
      const res = await verifyPhoneOtp(phone.trim(), cleanCode)
      if (res.verified) {
        setPhoneVerified(true)
        showToast('Phone number verified!')
      }
    } catch (err: any) {
      showToast(err?.message || 'Invalid or expired OTP')
    } finally {
      setVerifyingOtp(false)
    }
  }

  // Handle Create Alert
  async function handleCreateAlert(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.email) {
      showToast('Please sign in to set alerts')
      return
    }

    if (!notifyGoodTime && !notifyTargetPrice) {
      showToast('Select at least one alert trigger')
      return
    }

    let dest = ''
    if (channel === 'email') {
      dest = email.trim() || user.email
      if (!dest || !dest.includes('@')) {
        showToast('Please enter a valid email address')
        return
      }
    } else if (channel === 'sms') {
      dest = phone.trim()
      if (!dest) {
        showToast('Please enter your mobile number')
        return
      }
      if (!phoneVerified) {
        showToast('Please verify your phone number with OTP first')
        return
      }
    } else if (channel === 'telegram') {
      dest = telegramId.trim()
      if (!dest) {
        showToast('Please enter your Telegram chat ID')
        return
      }
    }

    const targetVal = notifyTargetPrice ? Number(targetPrice) : null
    if (notifyTargetPrice && (!targetVal || isNaN(targetVal) || targetVal <= 0)) {
      showToast('Please enter a valid target price')
      return
    }

    setSubmitting(true)
    try {
      await createAlert({
        user_email: user.email,
        product_id: productId,
        target_price: targetVal,
        notify_on_good_time: notifyGoodTime,
        channel,
        destination: dest,
      })
      showToast('Price alert successfully created!')
      await loadAlerts()
    } catch (err: any) {
      showToast(err?.message || 'Failed to create price alert')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete Alert
  async function handleDeleteAlert(id: string) {
    try {
      await deleteAlert(id)
      showToast('Alert removed')
      setActiveAlerts((prev) => prev.filter((a) => a.id !== id))
    } catch {
      showToast('Failed to remove alert')
    }
  }

  return (
    <div
      id="price-alert-section"
      style={{
        marginTop: '32px',
        padding: '28px',
        backgroundColor: 'var(--card, #ffffff)',
        border: '1px solid var(--line, #e5e7eb)',
        borderRadius: 'var(--r-xl, 16px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803d',
              flexShrink: 0,
            }}
          >
            <Bell size={22} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-h, #111827)',
                }}
              >
                Get Notified
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--champagne-deep, #92400e)',
                  backgroundColor: 'rgba(217, 119, 6, 0.12)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Sparkles size={11} /> Smart Alerts
              </span>
            </div>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.82rem',
                color: 'var(--text-muted, #6b7280)',
              }}
            >
              Get timely notifications when this product hits your budget or enters a prime buying window.
            </p>
          </div>
        </div>
      </div>

      {/* Auth check gate */}
      {!user ? (
        <div
          style={{
            padding: '24px',
            backgroundColor: 'var(--bg, #f9fafb)',
            borderRadius: 'var(--r-lg, 12px)',
            border: '1px dashed var(--line, #d1d5db)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogIn size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-h, #111827)' }}>
              Sign in to set price alerts
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
              Create and manage alerts across all your devices.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Link
              to="/login"
              style={{
                padding: '8px 20px',
                backgroundColor: 'var(--ink-900, #111827)',
                color: '#ffffff',
                borderRadius: 'var(--r-pill, 9999px)',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign In
            </Link>
          </div>
        </div>
      ) : (
        /* Alert Setup Form */
        <form onSubmit={handleCreateAlert}>
          {/* Toggles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            {/* Toggle 1: Good time to buy */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: 'var(--r-lg, 12px)',
                border: `1px solid ${notifyGoodTime ? 'var(--emerald, #10b981)' : 'var(--line, #e5e7eb)'}`,
                backgroundColor: notifyGoodTime ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg, #f9fafb)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={notifyGoodTime}
                onChange={(e) => setNotifyGoodTime(e.target.checked)}
                style={{ marginTop: '3px', accentColor: '#10b981', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                  Notify me when it's a good time to buy
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
                  Alerts you when the algorithmic Buy Score reaches 70 or higher based on market trends.
                </div>
              </div>
            </label>

            {/* Toggle 2: Target price */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: 'var(--r-lg, 12px)',
                border: `1px solid ${notifyTargetPrice ? 'var(--emerald, #10b981)' : 'var(--line, #e5e7eb)'}`,
                backgroundColor: notifyTargetPrice ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg, #f9fafb)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={notifyTargetPrice}
                onChange={(e) => setNotifyTargetPrice(e.target.checked)}
                style={{ marginTop: '3px', accentColor: '#10b981', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                  Notify me when price falls below ₹
                </div>
                {notifyTargetPrice && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative', width: '130px' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.85rem',
                          color: 'var(--text-muted, #6b7280)',
                          fontWeight: 600,
                        }}
                      >
                        ₹
                      </span>
                      <input
                        type="number"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        placeholder="Target"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '6px 10px 6px 24px',
                          borderRadius: 'var(--r-md, 8px)',
                          border: '1px solid var(--line, #d1d5db)',
                          backgroundColor: '#ffffff',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          outline: 'none',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)' }}>
                      (Default: 5% off {formatINR(currentPrice)})
                    </span>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Delivery Channel Selector */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-h, #374151)', marginBottom: '8px' }}>
              Delivery Channel:
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setChannel('email')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  border: `1px solid ${channel === 'email' ? 'var(--ink-900, #111827)' : 'var(--line, #e5e7eb)'}`,
                  backgroundColor: channel === 'email' ? 'var(--ink-900, #111827)' : '#ffffff',
                  color: channel === 'email' ? '#ffffff' : 'var(--text, #374151)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Mail size={15} /> Email
              </button>
              <button
                type="button"
                onClick={() => setChannel('sms')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  border: `1px solid ${channel === 'sms' ? 'var(--ink-900, #111827)' : 'var(--line, #e5e7eb)'}`,
                  backgroundColor: channel === 'sms' ? 'var(--ink-900, #111827)' : '#ffffff',
                  color: channel === 'sms' ? '#ffffff' : 'var(--text, #374151)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Smartphone size={15} /> Mobile (SMS)
              </button>
              <button
                type="button"
                onClick={() => setChannel('telegram')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  border: `1px solid ${channel === 'telegram' ? 'var(--ink-900, #111827)' : 'var(--line, #e5e7eb)'}`,
                  backgroundColor: channel === 'telegram' ? 'var(--ink-900, #111827)' : '#ffffff',
                  color: channel === 'telegram' ? '#ffffff' : 'var(--text, #374151)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Send size={15} /> Telegram
              </button>
            </div>
          </div>

          {/* Channel-Specific Input Box */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg, #f9fafb)',
              borderRadius: 'var(--r-lg, 12px)',
              border: '1px solid var(--line, #e5e7eb)',
              marginBottom: '16px',
            }}
          >
            {channel === 'email' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    marginBottom: '6px',
                  }}
                >
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    width: '100%',
                    maxWidth: '380px',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-md, 8px)',
                    border: '1px solid var(--line, #d1d5db)',
                    backgroundColor: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {channel === 'sms' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    marginBottom: '6px',
                  }}
                >
                  MOBILE NUMBER (OTP VERIFICATION REQUIRED)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setPhoneVerified(false)
                      setOtpSent(false)
                    }}
                    placeholder="+919876543210"
                    style={{
                      width: '200px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-md, 8px)',
                      border: '1px solid var(--line, #d1d5db)',
                      backgroundColor: '#ffffff',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  />
                  {!phoneVerified ? (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={sendingOtp || !phone.trim()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--r-md, 8px)',
                        border: '1px solid var(--line, #d1d5db)',
                        backgroundColor: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: sendingOtp ? 'wait' : 'pointer',
                        color: 'var(--text-h, #111827)',
                      }}
                    >
                      {sendingOtp ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#15803d',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      <ShieldCheck size={16} /> Verified
                    </div>
                  )}
                </div>

                {/* OTP Input section */}
                {otpSent && !phoneVerified && (
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="6-digit code"
                      style={{
                        width: '120px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-md, 8px)',
                        border: '1px solid var(--line, #d1d5db)',
                        backgroundColor: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        textAlign: 'center',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={verifyingOtp || otpCode.length !== 6}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--r-md, 8px)',
                        border: 'none',
                        backgroundColor: '#15803d',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: verifyingOtp ? 'wait' : 'pointer',
                      }}
                    >
                      {verifyingOtp ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                )}

                {otpDevHint && (
                  <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#15803d' }}>
                    {otpDevHint}
                  </div>
                )}
              </div>
            )}

            {channel === 'telegram' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    marginBottom: '6px',
                  }}
                >
                  TELEGRAM CHAT ID
                </label>
                <input
                  type="text"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="e.g. 123456789"
                  style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-md, 8px)',
                    border: '1px solid var(--line, #d1d5db)',
                    backgroundColor: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)', marginTop: '4px' }}>
                  Open Telegram and search for <strong>@UrbanPickBot</strong>, then type /start to get your Chat ID.
                </div>
              </div>
            )}
          </div>

          {/* Consent line */}
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted, #6b7280)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            We will only use your number for price alerts. You can delete the alert anytime.
          </div>

          {/* Submit button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="submit"
              disabled={submitting || (channel === 'sms' && !phoneVerified)}
              style={{
                padding: '10px 24px',
                borderRadius: 'var(--r-pill, 9999px)',
                border: 'none',
                backgroundColor: 'var(--ink-900, #111827)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: channel === 'sms' && !phoneVerified ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Bell size={16} /> {submitting ? 'Setting alert...' : 'Set Price Alert'}
            </button>
          </div>
        </form>
      )}

      {/* Active Alerts List for this product */}
      {activeAlerts.length > 0 && (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: '18px' }}>
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--text-h, #111827)',
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Active Alerts for this Product ({activeAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeAlerts.map((alt) => (
              <div
                key={alt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 'var(--r-md, 8px)',
                  backgroundColor: 'var(--bg, #f9fafb)',
                  border: '1px solid var(--line, #e5e7eb)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 7px',
                      borderRadius: 'var(--r-pill, 9999px)',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      color: '#4f46e5',
                    }}
                  >
                    {alt.channel}
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                    {alt.destination}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #6b7280)' }}>
                    •{' '}
                    {[
                      alt.notify_on_good_time ? 'Buy Score ≥ 70' : null,
                      alt.target_price ? `Price ≤ ${formatINR(alt.target_price)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' or ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAlert(alt.id)}
                  title="Delete Alert"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted, #9ca3af)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #9ca3af)')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
