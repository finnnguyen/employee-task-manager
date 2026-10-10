import { useEffect, useState } from 'react';
import { apiRequest } from './api';

export default function Employees({ token }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadEmployees() {
            try {
                const data = await apiRequest('/api/employees', { token });
                if (!cancelled) setEmployees(data.employees);
            } catch (error) {
                if (!cancelled) setError(error.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadEmployees();
        return () => { cancelled = true; };
    }, [token]);

    return (
        <section>
            <h2>Employees</h2>
            {loading && <p>Loading employees…</p>}
            {error && <p role="alert">{error}</p>}

            {!loading && !error && (
                employees.length === 0 ? (
                    <p>No employees yet.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(employee => (
                                <tr key={employee.id}>
                                    <td>{employee.name}</td>
                                    <td>{employee.email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )
            )}
        </section>
    );
}