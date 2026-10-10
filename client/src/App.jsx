import { useState } from 'react';
import { apiRequest } from './api';
import Employees from './Employees';

export default function App() {
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [otpRequested, setOtpRequested] = useState(false);
    const [token, setToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function requestOtp(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        setMessage('');

        try {
            const result = await apiRequest('/api/owner/request-otp', {
                method: 'POST',
                body: { phone: phone.trim() }
            });

            setOtpRequested(true);
            setMessage(result.message);
        } catch (error) {
            setError(error.message);
        } finally {
            setBusy(false);
        }
    }

    async function verifyOtp(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        setMessage('');

        try {
            const result = await apiRequest('/api/owner/verify-otp', {
                method: 'POST',
                body: { phone: phone.trim(), otp }
            });

            setToken(result.token);
            setOtp('');
            setMessage('You are logged in as the owner.');
        } catch (error) {
            setError(error.message);
        } finally {
            setBusy(false);
        }
    }

    function logout() {
        setToken('');
        setOtp('');
        setOtpRequested(false);
        setMessage('');
        setError('');
    }

    return (
        <main>
            <h1>Employee Task Manager</h1>

            {token ? (
                <section>
                    <h2>Owner dashboard</h2>
                    <p>{message}</p>
                    <button onClick={logout}>Log out</button>
                    <Employees token={token} />
                </section>
            ) : (
                <section>
                    <h2>Owner login</h2>

                    <form onSubmit={requestOtp}>
                        <label htmlFor="phone">Phone number</label>
                        <input
                            id="phone"
                            type="tel"
                            autoComplete="tel"
                            placeholder="+1..."
                            value={phone}
                            onChange={(event) => {
                                setPhone(event.target.value);
                                setOtpRequested(false);
                                setOtp('');
                                setMessage('');
                            }}
                            disabled={busy}
                            required
                        />
                        <button type="submit" disabled={busy}>
                            {busy ? 'Please wait…' : 'Request OTP'}
                        </button>
                    </form>

                    {otpRequested && (
                        <form onSubmit={verifyOtp}>
                            <label htmlFor="otp">Six-digit OTP</label>
                            <input
                                id="otp"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                value={otp}
                                onChange={(event) => setOtp(event.target.value)}
                                disabled={busy}
                                required
                            />
                            <button type="submit" disabled={busy}>
                                Verify and log in
                            </button>
                        </form>
                    )}

                    {message && <p role="status">{message}</p>}
                    {error && <p role="alert">{error}</p>}
                </section>
            )}
        </main>
    );
}