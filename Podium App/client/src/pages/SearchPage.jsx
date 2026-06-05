import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import { Search, MapPin, User } from 'lucide-react';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (query.length < 2) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await usersApi.search(query);
      setResults(data.users || []);
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <div className="page-header animate-in">
        <h1>Zoek Gebruikers</h1>
        <p>Vind andere theaterliefhebbers en word vrienden</p>
      </div>

      <form onSubmit={handleSearch} style={{ maxWidth: 500, marginBottom: 'var(--space-2xl)' }}>
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            className="form-input"
            placeholder="Zoek op naam of stad..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            minLength={2}
          />
        </div>
      </form>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : searched && results.length === 0 ? (
        <div className="empty-state">
          <User size={48} />
          <h3>Geen gebruikers gevonden</h3>
          <p>Probeer een andere zoekopdracht.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
          {results.map(user => (
            <Link
              to={`/profiel/${user.id}`}
              key={user.id}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar avatar-lg">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="card-title">{user.name}</div>
                  {user.city && (
                    <div className="card-meta">
                      <MapPin size={14} />
                      <span>{user.city}</span>
                    </div>
                  )}
                  {user.bio && (
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4, lineHeight: 1.4 }}>
                      {user.bio.length > 60 ? user.bio.slice(0, 60) + '...' : user.bio}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
