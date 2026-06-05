import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';
import './ProfilePage.css';

export default function EditProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, loading: authLoading, updateUser } = useAuth();
  const [form, setForm] = useState({ name: '', city: '', bio: '', avatar: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isOwnProfile = currentUser && parseInt(id) === currentUser.id;

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !isOwnProfile) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [authLoading, currentUser, id]);

  async function loadProfile() {
    try {
      const data = await usersApi.getProfile(id);
      setForm({
        name: data.user.name || '',
        city: data.user.city || '',
        bio: data.user.bio || '',
        avatar: data.user.avatar || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const data = await usersApi.updateProfile(id, form);
      updateUser(data.user);
      navigate(`/profiel/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="page container">
        <div className="profile-header">
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 32, width: 220, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 18, width: 160 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="page container">
        <div className="empty-state">
          <User size={56} />
          <h3>Log in om je profiel te bewerken</h3>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Inloggen</Link>
        </div>
      </div>
    );
  }

  if (!isOwnProfile) {
    return (
      <div className="page container">
        <div className="empty-state">
          <User size={56} />
          <h3>Je kunt alleen je eigen profiel bewerken</h3>
          <Link to={`/profiel/${currentUser.id}`} className="btn btn-primary" style={{ marginTop: 16 }}>
            Mijn profiel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <Link to={`/profiel/${id}`} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
        <ArrowLeft size={16} />
        Terug naar profiel
      </Link>

      <div className="profile-page animate-in">
        <div className="profile-header">
          <div className="avatar avatar-xl">
            {form.name?.charAt(0).toUpperCase() || currentUser.name?.charAt(0).toUpperCase()}
          </div>
          <div className="profile-info">
            <h1>Profiel bewerken</h1>
            <p className="profile-bio">Werk je gegevens bij voor andere theaterliefhebbers.</p>
          </div>
        </div>

        <form className="profile-edit-form card" onSubmit={handleSubmit}>
          <div className="card-body">
            {error && <div className="auth-error" style={{ marginBottom: 'var(--space-lg)' }}>{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="name">Naam</label>
              <input
                id="name"
                name="name"
                type="text"
                className="form-input"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="city">Stad</label>
              <input
                id="city"
                name="city"
                type="text"
                className="form-input"
                value={form.city}
                onChange={handleChange}
                placeholder="Amsterdam"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="avatar">Avatar URL</label>
              <input
                id="avatar"
                name="avatar"
                type="url"
                className="form-input"
                value={form.avatar}
                onChange={handleChange}
                placeholder="https://..."
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                className="form-input form-textarea"
                value={form.bio}
                onChange={handleChange}
                maxLength={280}
                placeholder="Vertel iets over je smaak, favoriete podia of volgende theateravond."
              />
              <span className="form-help">{form.bio.length}/280</span>
            </div>

            <div className="profile-edit-actions">
              <Link to={`/profiel/${id}`} className="btn btn-outline">Annuleren</Link>
              <button type="submit" className="btn btn-accent" disabled={saving}>
                {saving ? <span className="spinner" /> : <><Save size={18} /> Opslaan</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
