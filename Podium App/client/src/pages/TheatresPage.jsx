import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { theatresApi } from '../services/api';
import { MapPin, Search, Theater, Globe } from 'lucide-react';
import './TheatresPage.css';

export default function TheatresPage() {
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');

  useEffect(() => {
    loadTheatres();
  }, []);

  async function loadTheatres() {
    try {
      const data = await theatresApi.getAll();
      setTheatres(data.theatres || []);
    } catch (err) {
      console.error('Error loading theatres:', err);
    } finally {
      setLoading(false);
    }
  }

  const provinces = [...new Set(theatres.map(t => t.province))].sort();

  const filtered = theatres.filter(t => {
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvince = !selectedProvince || t.province === selectedProvince;
    return matchesSearch && matchesProvince;
  });

  return (
    <div className="page container">
      <div className="page-header animate-in">
        <h1>Theaters in Nederland</h1>
        <p>Ontdek de mooiste podia van het land en bekijk hun programmering</p>
      </div>

      <div className="theatres-filters animate-in animate-in-delay-1">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            className="form-input"
            placeholder="Zoek op naam of stad..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="form-input province-select"
          value={selectedProvince}
          onChange={e => setSelectedProvince(e.target.value)}
        >
          <option value="">Alle provincies</option>
          {provinces.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="theatres-count text-secondary">
        {filtered.length} {filtered.length === 1 ? 'theater' : 'theaters'} gevonden
      </div>

      {loading ? (
        <div className="grid grid-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 180 }} />
              <div className="card-body">
                <div className="skeleton" style={{ height: 22, width: '70%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 16, width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((theatre, i) => (
            <Link
              to={`/theater/${theatre.id}`}
              key={theatre.id}
              className="card theatre-list-card animate-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="theatre-list-image">
                <Theater size={36} className="theatre-list-icon" />
              </div>
              <div className="card-body">
                <h3 className="card-title">{theatre.name}</h3>
                <div className="card-meta" style={{ marginBottom: '8px' }}>
                  <MapPin size={14} />
                  <span>{theatre.city}, {theatre.province}</span>
                </div>
                {theatre.description && (
                  <p className="theatre-description">{theatre.description}</p>
                )}
                {theatre.website && (
                  <div className="card-meta" style={{ marginTop: '8px' }}>
                    <Globe size={14} />
                    <span className="text-accent">Website bezoeken</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <Theater size={64} />
          <h3>Geen theaters gevonden</h3>
          <p>Probeer een andere zoekopdracht of filter.</p>
        </div>
      )}
    </div>
  );
}
