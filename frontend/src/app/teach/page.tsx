'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Button, Modal, Field, Input, Select, Alert, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, ApiException, type Course, type Category } from '@/lib/api';
import { Plus, Layers, PenSquare, ArrowRight } from 'lucide-react';

export default function TeachPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [shortname, setShortname] = useState('');
  const [fullname, setFullname] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [list, cats] = await Promise.all([
      api.get<Course[]>('/courses').catch(() => []),
      api.get<Category[]>('/categories').catch(() => []),
    ]);
    setCourses(list); setCategories(cats);
    if (cats[0] && !categoryId) setCategoryId(cats[0].id);
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { const me = await auth.me(); setEmail(me.email); await load(); }
      finally { setLoading(false); }
    })();
  }, [ready]);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      let catId = categoryId;
      if (!catId) { const cat = await api.post<Category>('/categories', { name: 'General' }); catId = cat.id; }
      await api.post('/courses', {
        categoryId: catId, shortname, fullname, status: 'active',
        isPaid, priceMinor: isPaid ? Math.round(parseFloat(price || '0') * 100) : 0, currency: 'KES',
      });
      setShortname(''); setFullname(''); setIsPaid(false); setPrice(''); setShowForm(false); await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not create course.');
    } finally { setBusy(false); }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head head-row">
        <div>
          <span className="eyebrow">Teaching</span>
          <h1>Your courses</h1>
          <p className="muted">Create courses and build their content.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={16} /> New course</Button>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="grid">{[...Array(3)].map((_, i) => <Skeleton key={i} height="9rem" />)}</div>
      ) : courses.length === 0 ? (
        <Card><EmptyState icon={<PenSquare size={36} />} title="No courses yet"
          body="Create your first course, then add sections, videos, and assignments."
          action={<Button onClick={() => setShowForm(true)}><Plus size={16} /> New course</Button>} /></Card>
      ) : (
        <div className="grid">
          {courses.map((c) => (
            <Card key={c.id} className="tc">
              <div className="tc-top">
                <Badge tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Badge>
                <span className="mono tc-code">{c.shortname}</span>
              </div>
              <h3>{c.fullname}</h3>
              <div className="tc-actions">
                <a href={`/teach/builder?course=${c.id}`}><Button variant="ghost" size="sm"><Layers size={15} /> Build</Button></a>
                <a href={`/teach/enrolments?course=${c.id}`}><Button variant="ghost" size="sm">Enrolments</Button></a>
                <a href={`/courses/${c.id}`} className="view-link">View <ArrowRight size={14} /></a>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New course"
        footer={<>
          <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button onClick={createCourse} disabled={busy || !shortname || !fullname}>{busy ? 'Creating…' : 'Create course'}</Button>
        </>}>
        <Field label="Course code" hint="short identifier, e.g. BIO101"><Input value={shortname} onChange={(e) => setShortname(e.target.value)} placeholder="BIO101" /></Field>
        <Field label="Course name"><Input value={fullname} onChange={(e) => setFullname(e.target.value)} placeholder="Introduction to Biology" /></Field>
        <Field label="Access">
          <Select value={isPaid ? 'paid' : 'free'} onChange={(e) => setIsPaid(e.target.value === 'paid')}>
            <option value="free">Free — open enrolment</option>
            <option value="paid">Paid — payment required before enrolment</option>
          </Select>
        </Field>
        {isPaid && (
          <Field label="Price (KES)" hint="learners must pay this before they can enrol">
            <Input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3000" />
          </Field>
        )}
        {categories.length > 0 && (
          <Field label="Category"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></Field>
        )}
      </Modal>

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1.25rem; }
        :global(.tc) { padding: 1.4rem; }
        .tc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
        .tc-code { font-size: 0.8rem; color: var(--ink-faint); }
        .tc h3 { font-size: 1.1rem; margin-bottom: 1rem; }
        .tc-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .view-link { font-size: 0.82rem; color: var(--accent); font-weight: 600; display: inline-flex; align-items: center; gap: 0.2rem; margin-left: auto; }
        .mono { font-family: var(--mono); }
      `}</style>
    </AppShell>
  );
}
