'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    if (newPw !== confirm) { setMsg('Passwords do not match.'); return }
    if (newPw.length < 8) { setMsg('Password must be at least 8 characters.'); return }

    setLoading(true)
    const supabase = createClient()

    // First verify current password by re-authenticating
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setMsg('Not logged in.'); setLoading(false); return }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInError) { setMsg('Current password is incorrect.'); setLoading(false); return }

    // Now update via our RPC
    const { data, error } = await supabase.rpc('change_my_password', { new_password: newPw })
    if (error || !data) {
      setMsg('Failed to update password. Try again.')
    } else {
      setMsg('✅ Password updated successfully!')
      setCurrent(''); setNewPw(''); setConfirm('')
      setTimeout(() => setOpen(false), 2000)
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-bear-muted hover:text-bear-dark transition-colors px-2 py-1 rounded-lg hover:bg-white/50"
      >
        🔒 Change Password
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold text-bear-dark">Change Password</h2>
              <button onClick={() => setOpen(false)} className="text-bear-muted hover:text-bear-dark text-xl">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {[
                { label: 'Current Password', val: current, set: setCurrent },
                { label: 'New Password', val: newPw, set: setNewPw },
                { label: 'Confirm New Password', val: confirm, set: setConfirm },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">{label}</label>
                  <input
                    type="password"
                    value={val}
                    onChange={e => set(e.target.value)}
                    required
                    minLength={label === 'Current Password' ? 1 : 8}
                    className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  />
                </div>
              ))}

              {msg && (
                <div className={`text-sm rounded-xl px-4 py-2 ${msg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {msg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
