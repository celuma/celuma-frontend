/* useState: Used to save values (data, errors, etc.) in the component's state.
useEffect: Used to execute code when the component is mounted (or when dependencies change).*/
import { useEffect, useState } from 'react'

type HealthResponse = {
    status?: string
    //It means that other fields may appear that you don't know, but it won't give you an error.
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
        <div className = "health-container">
            <h2> Health Check </h2>
            <div className = "health-status" aria-live = "polite" aria-busy = {loading}>
                {loading
                    ? 'Checking…'
                    : isOk
                        ? 'Ok'
                        : 'Error'}
            </div>
        </div>
    )
}