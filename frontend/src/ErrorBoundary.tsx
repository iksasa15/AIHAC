import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '2rem',
            fontFamily: 'Cairo, sans-serif',
            background: '#0c1a24',
            color: '#f4f7f5',
            direction: 'rtl',
          }}
        >
          <h1 style={{ marginTop: 0 }}>حدث خطأ في الواجهة</h1>
          <p style={{ color: '#a8c0c8' }}>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.25rem',
              border: 'none',
              borderRadius: 12,
              background: '#2ec4b6',
              color: '#042028',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
