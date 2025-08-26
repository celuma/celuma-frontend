import { useEffect, useState } from 'react'

type HealthResponse = {
    status?: string
    [key: string]: unknown
}

export default function HealthPage() {
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<HealthResponse | null>(null)

    useEffect(() => {
        let isMounted = true
        const fetchHealth = async () => {
            setLoading(true)
            setError(null)
            try {
                const base = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_BASE_URL || '/api')
                const res = await fetch(`${base}/v1/health`, {
                    headers: { accept: 'application/json' },
                })
                const json = (await res.json()) as HealthResponse
                if (!isMounted) return
                setData(json)
            } catch (err) {
                if (!isMounted) return
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        fetchHealth()
        return () => {
            isMounted = false
        }
    }, [])

    const isOk = data && !error && (data.status === 'ok' || data.status === 'OK')

    return (
        <div className="health-container">
            <h2>Health Check</h2>
            <div className="health-status" aria-live="polite" aria-busy={loading}>
                {loading
                    ? 'Checking…'
                    : isOk
                        ? 'FUNCIONO'
                        : 'NO FUNCIONO'}
            </div>
        </div>
    )
}