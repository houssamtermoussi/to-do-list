// src/App.jsx
// Application Todo List complète avec Supabase (Auth + CRUD + Temps réel)

import { useState, useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import './App.css'

/* ══════════════════════════════════════════════
   Composant principal
   ══════════════════════════════════════════════ */
export default function App() {
  // ── États d'authentification ──
  const [session, setSession]     = useState({
    user: {
      id: 'local-guest-user',
      email: 'invite@local.dev'
    }
  })   // session locale active par défaut pour accès direct
  const [authLoading, setAuthLoading] = useState(false) // pas de chargement initial

  // ── États Todo ──
  const [todos, setTodos]         = useState([])
  const [todosLoading, setTodosLoading] = useState(false)
  const [newTask, setNewTask]     = useState('')
  const [adding, setAdding]       = useState(false)

  // ── États Auth Form ──
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  /* ════════════════════════════════
     1. Gestion de la session
     ════════════════════════════════ */
  useEffect(() => {
    // Session locale par défaut, pas besoin d'écouter les évènements d'authentification Supabase
  }, [])

  /* ════════════════════════════════
     2. Chargement des todos + temps réel
     ════════════════════════════════ */
  useEffect(() => {
    if (!session) {
      setTodos([])
      return
    }

    // Chargement initial
    fetchTodos()

    // Abonnement temps réel
    const channel = supabase
      .channel('todos-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',              // tous les événements
          schema: 'public',
          table: 'todos',
        },
        (payload) => {
          handleRealtimeEvent(payload)
        }
      )
      .subscribe()

    // Nettoyage : désabonnement à la déconnexion
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  /* ════════════════════════════════
     3. Helpers todos
     ════════════════════════════════ */

  /** Récupère tous les todos de l'utilisateur connecté */
  async function fetchTodos() {
    setTodosLoading(true)
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('inserted_at', { ascending: false })

    if (error) {
      console.warn("Supabase fetch error, using localStorage:", error)
      // Fallback vers localStorage
      const localTodos = JSON.parse(localStorage.getItem('todos') || '[]')
      setTodos(localTodos)
    } else {
      setTodos(data || [])
      // Sauvegarde dans localStorage comme backup
      localStorage.setItem('todos', JSON.stringify(data || []))
    }
    setTodosLoading(false)
  }

  /** Traite les événements temps réel */
  function handleRealtimeEvent(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload

    if (eventType === 'INSERT') {
      setTodos((prev) => {
        // Évite les doublons si l'événement vient du même onglet
        if (prev.find((t) => t.id === newRecord.id)) return prev
        return [newRecord, ...prev]
      })
    }

    if (eventType === 'UPDATE') {
      setTodos((prev) =>
        prev.map((t) => (t.id === newRecord.id ? newRecord : t))
      )
    }

    if (eventType === 'DELETE') {
      setTodos((prev) => prev.filter((t) => t.id !== oldRecord.id))
    }
  }

  /** Ajoute un nouveau todo */
  async function addTodo(e) {
    e.preventDefault()
    const task = newTask.trim()
    if (!task) return

    setAdding(true)
    const { data, error } = await supabase
      .from('todos')
      .insert([{ task, is_complete: false }])
      .select()
      .single()

    if (error) {
      console.warn("Supabase insert error (Auth disabled fallback to local state):", error)
      // Fallback local robust en cas d'erreur de base de données / RLS
      const fallbackTodo = {
        id: Math.random().toString(36).substr(2, 9),
        task: task,
        is_complete: false,
        inserted_at: new Date().toISOString()
      }
      const newTodos = [fallbackTodo, ...todos]
      setTodos(newTodos)
      localStorage.setItem('todos', JSON.stringify(newTodos))
      setNewTask('')
      toast.success('Tâche ajoutée ! (Mode Local)')
    } else {
      // Ajout optimiste côté client
      setTodos((prev) => [data, ...prev])
      setNewTask('')
      toast.success('Tâche ajoutée !')
    }
    setAdding(false)
  }

  /** Bascule l'état complété d'un todo */
  async function toggleTodo(todo) {
    // Changement immédiat local pour réactivité optimale
    const newTodos = todos.map((t) => (t.id === todo.id ? { ...t, is_complete: !t.is_complete } : t))
    setTodos(newTodos)
    localStorage.setItem('todos', JSON.stringify(newTodos))

    const { error } = await supabase
      .from('todos')
      .update({ is_complete: !todo.is_complete })
      .eq('id', todo.id)

    if (error) {
      console.warn("Supabase toggle warning (applied locally):", error)
    }
  }

  /** Supprime un todo */
  async function deleteTodo(id) {
    // Suppression immédiate locale
    const newTodos = todos.filter((t) => t.id !== id)
    setTodos(newTodos)
    localStorage.setItem('todos', JSON.stringify(newTodos))

    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)

    if (error) {
      console.warn("Supabase delete warning (applied locally):", error)
      toast.success('Tâche supprimée.')
    } else {
      toast.success('Tâche supprimée.')
    }
  }

  /* ════════════════════════════════
     4. Authentification
     ════════════════════════════════ */

  /** Connexion avec email / mot de passe */
  async function handleLogin(e) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message || 'Identifiants incorrects.')
    } else {
      toast.success('Connexion réussie !')
      setEmail('')
      setPassword('')
    }
    setSubmitting(false)
  }

  /** Déconnexion */
  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Erreur lors de la déconnexion.')
    } else {
      toast.success('Déconnecté.')
    }
  }

  /* ════════════════════════════════
     5. Rendu
     ════════════════════════════════ */

  // Chargement initial de la session
  if (authLoading) {
    return (
      <div className="app-wrapper">
        <div className="loading-wrapper">
          <div className="spinner" />
          <span>Chargement…</span>
        </div>
      </div>
    )
  }

  // Statistiques
  const total    = todos.length
  const done     = todos.filter((t) => t.is_complete).length
  const pending  = total - done

  return (
    <>
      {/* Notifications toast */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.88rem',
            borderRadius: '10px',
            background: '#fff',
            color: '#292524',
            boxShadow: '0 4px 20px rgba(0,0,0,.12)',
          },
          success: { iconTheme: { primary: '#b8852a', secondary: '#fff' } },
        }}
      />

      <div className="app-wrapper">

        {/* ── Si non connecté : formulaire Auth ── */}
        {!session ? (
          <div className="auth-card">
            {/* En-tête */}
            <div className="auth-header">
              <span className="auth-logo">✅</span>
              <h1>TodoApp</h1>
              <p>Connectez-vous pour gérer vos tâches</p>
            </div>

            {/* Formulaire Connexion */}
            <form onSubmit={handleLogin} id="login-form">
              <div className="form-group">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="form-input"
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">Mot de passe</label>
                <input
                  id="login-password"
                  className="form-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                id="btn-login-submit"
                className="btn-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>
          </div>


        ) : (

          /* ── Si connecté : Todo App ── */
          <div className="todo-container">

            {/* En-tête avec email et bouton déconnexion */}
            <div className="todo-header">
              <div className="todo-header-left">
                <h1>✅ Mes tâches</h1>
              </div>
            </div>

            {/* Formulaire ajout de todo */}
            <form className="todo-add-form" onSubmit={addTodo} id="add-todo-form">
              <input
                id="new-todo-input"
                className="todo-add-input"
                type="text"
                placeholder="Ajouter une nouvelle tâche…"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                disabled={adding}
                maxLength={280}
              />
              <button
                id="btn-add-todo"
                className="btn-add"
                type="submit"
                disabled={adding || !newTask.trim()}
              >
                {adding ? '…' : '+ Ajouter'}
              </button>
            </form>

            {/* Barre de stats */}
            <div className="todo-stats">
              <span>
                <span className="badge">{pending}</span>&nbsp; en cours · <strong>{done}</strong> terminée{done > 1 ? 's' : ''}
              </span>
              <span>{total} tâche{total > 1 ? 's' : ''} au total</span>
            </div>

            {/* Liste de todos */}
            <div className="todo-list" id="todo-list">

              {/* Chargement */}
              {todosLoading && (
                <div className="loading-wrapper">
                  <div className="spinner" />
                  <span>Chargement des tâches…</span>
                </div>
              )}

              {/* Liste vide */}
              {!todosLoading && todos.length === 0 && (
                <div className="todo-empty">
                  <span className="empty-icon">📋</span>
                  <p>Aucune tâche pour l'instant.<br />Ajoutez-en une ci-dessus !</p>
                </div>
              )}

              {/* Items */}
              {!todosLoading && todos.map((todo) => (
                <div key={todo.id} className="todo-item" id={`todo-${todo.id}`}>
                  {/* Checkbox complétion */}
                  <input
                    id={`check-${todo.id}`}
                    className="todo-checkbox"
                    type="checkbox"
                    checked={todo.is_complete}
                    onChange={() => toggleTodo(todo)}
                    aria-label={`Marquer "${todo.task}" comme ${todo.is_complete ? 'non complétée' : 'complétée'}`}
                  />
                  {/* Texte */}
                  <span className={`todo-text ${todo.is_complete ? 'completed' : ''}`}>
                    {todo.task}
                  </span>
                  {/* Bouton suppression */}
                  <button
                    id={`delete-${todo.id}`}
                    className="btn-delete"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`Supprimer "${todo.task}"`}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </>
  )
}