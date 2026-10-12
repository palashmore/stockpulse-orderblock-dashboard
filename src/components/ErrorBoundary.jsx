import { Component } from 'react';

// A screen that throws should show a message and a way back, not leave a blank page
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h2 className="text-sm font-semibold text-gray-200 mb-1">This screen hit an error</h2>
          <p className="text-xs text-gray-500 mb-3">{String(this.state.error?.message ?? this.state.error)}</p>
          <button onClick={() => this.setState({ error: null })} className="px-3 py-1.5 text-xs rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }
}
