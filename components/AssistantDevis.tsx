'use client'

// =============================================================
// Assistant de consultation (widget de chat flottant)
// =============================================================
// Bouton flottant en bas à droite ; au clic, une fenêtre de chat s'ouvre avec un
// accueil et des exemples cliquables. L'artisan pose ses questions, le bot répond
// via /api/assistant-devis (orchestrateur → domaines).
//
// PHASE 2 : seul le domaine COMPTES RENDUS est branché côté données ; devis/clients
// répondent un repli propre. LECTURE SEULE : le widget ne fait qu'interroger et
// afficher. Aucun stockage navigateur (état React uniquement).

import { useEffect, useRef, useState } from 'react'
import VocalRecorderOgg from './VocalRecorderOgg'

// Candidat cliquable (homonymes) : renvoyé par l'API en Phase 3 (domaines clients).
// Absent en Phase 2, mais le composant le gère pour rester compatible.
interface Candidat {
  libelle: string
  valeur: string
  ville: string | null
  origine: 'costructor' | 'app'
}

interface Message {
  id: number
  role: 'user' | 'bot'
  texte: string
  candidats?: Candidat[]
  questionOrigine?: string
  domaine?: string
  // Boucle d'apprentissage : id de l'échange journalisé + note donnée (👍/👎).
  interactionId?: string
  feedback?: 1 | -1
}

// Exemples cliquables — orientés COMPTES RENDUS (le domaine actif en Phase 2), pour
// qu'ils renvoient toujours une vraie réponse.
const EXEMPLES = [
  'Combien de visites ai-je faites ?',
  'Mes 3 plus gros devis',
  'La liste de mes clients',
  'Quels chantiers avaient des fissures ?',
]

// Accueil personnalisé : l'assistant salue l'artisan par son prénom.
function messageAccueil(nom: string): string {
  const prenom = nom.trim() ? ` ${nom.trim()}` : ''
  return `Bonjour${prenom} 👋 Comment puis-je vous aider ?`
}

// Rendu du texte du bot en éléments React, SANS injection HTML (on construit les
// nœuds nous-mêmes) et TOUJOURS PROPRE : on convertit le markdown éventuel et on
// retire tout caractère parasite (jamais de #, *, ` visibles) — filet de sécurité
// en plus de la consigne donnée à l'IA. Que du texte, du gras et des emojis.

// Retire les symboles markdown résiduels d'un fragment de texte (hors **gras** déjà
// traité en amont) : accents graves, étoiles/underscores isolés, dièses.
function nettoyerResidu(s: string): string {
  return s
    .replace(/`+/g, '')
    .replace(/[*_]{1,3}/g, '')
    .replace(/#+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
}

// Une ligne faite de tirets/étoiles/underscores = séparateur markdown → espacement.
function estSeparateur(ligne: string): boolean {
  return /^\s*([-*_]\s*){3,}$/.test(ligne)
}

// Rend le **gras** d'une ligne et nettoie le reste.
function rendreInline(texte: string, cleBase: string) {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${cleBase}-${i}`}>{nettoyerResidu(part.slice(2, -2))}</strong>
    ) : (
      <span key={`${cleBase}-${i}`}>{nettoyerResidu(part)}</span>
    ),
  )
}

function formaterTexte(texte: string) {
  return texte.split('\n').map((brute, i) => {
    if (brute.trim() === '' || estSeparateur(brute)) {
      return <div key={i} className="h-2" />
    }
    // Titre markdown (# ## ###) → ligne en gras, sans les dièses.
    const mTitre = brute.match(/^\s{0,3}#{1,6}\s+(.*)$/)
    if (mTitre) {
      return (
        <p key={i} className="font-semibold">
          {rendreInline(mTitre[1], `t-${i}`)}
        </p>
      )
    }
    // Puce markdown (- / * / +) en début de ligne → « • ».
    const ligne = brute.replace(/^\s{0,3}[-*+]\s+/, '• ')
    return <p key={i}>{rendreInline(ligne, `l-${i}`)}</p>
  })
}

// Construit le transcript de la conversation en cours (mémoire), envoyé à chaque
// requête. Borné comme le backend. Sert UNIQUEMENT à la compréhension côté serveur.
const MAX_HISTORIQUE = 8
const MAX_BOT_HISTO = 400
const MAX_USER_HISTO = 300
function tronquerHisto(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t
}
function construireHistorique(msgs: Message[]): { role: 'user' | 'bot'; texte: string }[] {
  return msgs
    .slice(-MAX_HISTORIQUE)
    .filter((m) => m.texte && m.texte.trim())
    .map((m) => ({
      role: m.role,
      texte: tronquerHisto(m.texte, m.role === 'bot' ? MAX_BOT_HISTO : MAX_USER_HISTO),
    }))
}

export default function AssistantDevis({ nom, entreprise }: { nom: string; entreprise: string }) {
  const accueil = messageAccueil(nom)
  const [ouvert, setOuvert] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [saisie, setSaisie] = useState('')
  const [reflexion, setReflexion] = useState(false)
  const [transcription, setTranscription] = useState(false)
  const [erreurVocal, setErreurVocal] = useState('')
  const [dernierClient, setDernierClient] = useState<string | null>(null)
  const compteur = useRef(0)
  const finRef = useRef<HTMLDivElement>(null)
  const champRef = useRef<HTMLInputElement>(null)
  const defileRef = useRef(false)

  // Défile en bas à chaque nouveau message / pendant la réflexion.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, reflexion])

  // Focus sur le champ à l'ouverture.
  useEffect(() => {
    if (ouvert) champRef.current?.focus()
  }, [ouvert])

  // --- Bouton flottant non intrusif ---
  const [masque, setMasque] = useState(false)
  const [defile, setDefile] = useState(false)
  const BASE_BOTTOM = 'calc(6.5rem + max(12px, env(safe-area-inset-bottom)))'
  const [bottomStyle, setBottomStyle] = useState<string>(BASE_BOTTOM)
  useEffect(() => {
    const MIN_INTERVAL = 130
    let rafId = 0
    let throttleT: ReturnType<typeof setTimeout> | undefined
    let idleT: ReturnType<typeof setTimeout> | undefined
    let moT: ReturnType<typeof setTimeout> | undefined
    let lastCompute = 0

    function recompute() {
      const m = !!document.querySelector('.fixed.inset-0')
      setMasque((prev) => (prev === m ? prev : m))
      const vh = window.innerHeight
      let maxIntrusion = 0
      document
        .querySelectorAll<HTMLElement>('.fixed.bottom-0, [data-bottombar]')
        .forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.height > 0 && r.bottom >= vh - 2) {
            const intrusion = vh - r.top
            if (intrusion > maxIntrusion) maxIntrusion = intrusion
          }
        })
      const next = maxIntrusion > 0 ? `${Math.round(maxIntrusion) + 16}px` : BASE_BOTTOM
      setBottomStyle((prev) => (prev === next ? prev : next))
    }
    function doRecompute() {
      rafId = 0
      lastCompute = Date.now()
      recompute()
    }
    function planifier() {
      if (rafId || throttleT) return
      const reste = MIN_INTERVAL - (Date.now() - lastCompute)
      if (reste <= 0) {
        rafId = requestAnimationFrame(doRecompute)
      } else {
        throttleT = setTimeout(() => {
          throttleT = undefined
          rafId = requestAnimationFrame(doRecompute)
        }, reste)
      }
    }
    function onScroll() {
      if (!defileRef.current) {
        defileRef.current = true
        setDefile(true)
      }
      clearTimeout(idleT)
      idleT = setTimeout(() => {
        defileRef.current = false
        setDefile(false)
      }, 500)
      planifier()
    }
    planifier()
    const mo = new MutationObserver(() => {
      clearTimeout(moT)
      moT = setTimeout(planifier, 200)
    })
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', planifier)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(throttleT)
      clearTimeout(idleT)
      clearTimeout(moT)
      mo.disconnect()
      window.removeEventListener('resize', planifier)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  async function poser(
    corps: { question: string; clientForce?: string; domaineForce?: string },
    texteUtilisateur: string,
  ) {
    if (reflexion) return
    const historique = construireHistorique(messages)
    setMessages((m) => [...m, { id: compteur.current++, role: 'user', texte: texteUtilisateur }])
    setReflexion(true)
    try {
      const res = await fetch('/api/assistant-devis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...corps, dernierClient, historique }),
      })
      const data = await res.json().catch(() => ({}))
      const reponse =
        res.ok && data.reponse ? data.reponse : data.error || "Désolé, je n'ai pas pu répondre."
      const candidats = Array.isArray(data.candidats) ? (data.candidats as Candidat[]) : undefined
      setMessages((m) => [
        ...m,
        {
          id: compteur.current++,
          role: 'bot',
          texte: reponse,
          candidats,
          questionOrigine: corps.question,
          domaine: typeof data.domaine === 'string' ? data.domaine : undefined,
          interactionId: typeof data.interactionId === 'string' ? data.interactionId : undefined,
        },
      ])
      if (typeof data.clientContexte === 'string' && data.clientContexte) {
        setDernierClient(data.clientContexte)
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: compteur.current++, role: 'bot', texte: "Désolé, je n'ai pas pu répondre. Vérifiez la connexion." },
      ])
    } finally {
      setReflexion(false)
    }
  }

  async function envoyer(texte: string) {
    const question = texte.trim()
    if (!question || reflexion) return
    setSaisie('')
    await poser({ question }, question)
  }

  // Boucle d'apprentissage : l'artisan note une réponse (👍/👎). On met à jour l'UI
  // tout de suite (optimiste) puis on persiste ; best-effort, on n'alerte pas en cas
  // d'échec réseau (le signal visuel reste, ça suffit à l'usage).
  async function noter(msgId: number, interactionId: string, valeur: 1 | -1) {
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, feedback: valeur } : x)))
    try {
      await fetch('/api/assistant-devis/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, feedback: valeur }),
      })
    } catch {
      // best-effort
    }
  }

  function choisirCandidat(candidat: Candidat, questionOrigine: string, domaine: string) {
    if (reflexion) return
    const texteUtilisateur = candidat.ville ? `${candidat.libelle}, ${candidat.ville}` : candidat.libelle
    void poser(
      { question: questionOrigine, clientForce: candidat.valeur, domaineForce: domaine },
      texteUtilisateur,
    )
  }

  // Dictée vocale : même endpoint que les notes de visite (/api/transcribe). LECTURE
  // SEULE : on remplit juste le champ (modifiable), jamais d'envoi automatique.
  async function transcrire(blob: Blob) {
    if (blob.size < 1000) {
      setErreurVocal('Enregistrement trop court.')
      return
    }
    setErreurVocal('')
    setTranscription(true)
    try {
      const formData = new FormData()
      // L'API /api/transcribe de MTC37 lit le champ `file`.
      formData.append('file', blob, blob.type.includes('ogg') ? 'question.ogg' : 'question.webm')
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      const texte = (data.text ?? '').trim()
      if (res.ok && texte) {
        setSaisie((prev) => (prev.trim() ? `${prev.trim()} ${texte}` : texte))
      } else {
        setErreurVocal('Transcription échouée. Réessayez ou tapez votre question.')
      }
    } catch {
      setErreurVocal('Transcription échouée. Réessayez ou tapez votre question.')
    } finally {
      setTranscription(false)
      champRef.current?.focus()
    }
  }

  return (
    <>
      {/* Bouton flottant (masqué quand une modale est ouverte) */}
      {!ouvert && !masque && (
        <button
          onClick={() => setOuvert(true)}
          aria-label="Ouvrir l'assistant"
          className={`fixed right-5 z-50 h-12 w-12 rounded-full bg-primary text-white shadow-md shadow-primary/30 flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all duration-300 animate-scale-in ${
            defile
              ? 'opacity-70 sm:opacity-0 sm:translate-y-1 sm:pointer-events-none'
              : 'opacity-70 hover:opacity-100 focus-visible:opacity-100 active:opacity-100'
          }`}
          style={{ bottom: bottomStyle }}
        >
          <IconeBot className="h-6 w-6" />
        </button>
      )}

      {/* Fenêtre de chat */}
      {ouvert && (
        <div
          className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[384px] flex flex-col rounded-2xl bg-white shadow-2xl border border-border overflow-hidden animate-scale-in"
          style={{
            height: 'min(78vh, 600px)',
            marginBottom: 'env(safe-area-inset-bottom)',
          }}
          role="dialog"
          aria-label="Assistant"
        >
          {/* En-tête */}
          <div className="flex items-center gap-3 bg-header text-white px-4 py-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shrink-0">
              <IconeBot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Assistant</p>
              {entreprise.trim() && (
                <p className="text-[11px] text-white/60 leading-tight truncate">{entreprise.trim()}</p>
              )}
            </div>
            <button
              onClick={() => setOuvert(false)}
              aria-label="Fermer"
              className="text-white/70 hover:text-white p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Conversation */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3 bg-background">
            <Bulle role="bot">{accueil}</Bulle>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pl-1">
                {EXEMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => envoyer(ex)}
                    className="text-xs text-primary-dark bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full px-3 py-1.5 transition active:scale-95"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <Bulle role={m.role}>
                  {m.role === 'bot' ? formaterTexte(m.texte) : m.texte}
                </Bulle>
                {m.role === 'bot' && m.candidats && m.candidats.length > 0 && (
                  <div className="flex flex-col gap-2 pl-1">
                    {m.candidats.map((c, i) => (
                      <button
                        key={`${m.id}-${i}`}
                        onClick={() => choisirCandidat(c, m.questionOrigine ?? '', m.domaine ?? 'clients')}
                        disabled={reflexion}
                        className="flex items-center justify-between gap-2 text-left bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl px-3 py-2 transition active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">{c.libelle}</span>
                          {c.ville && (
                            <span className="block text-xs text-gray-500 truncate">{c.ville}</span>
                          )}
                        </span>
                        {c.origine === 'app' && (
                          <span className="shrink-0 text-[10px] font-medium text-primary-dark bg-primary/15 border border-primary/20 rounded-full px-2 py-0.5">
                            fiche app
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {/* Feedback 👍/👎 : alimente la boucle d'apprentissage. */}
                {m.role === 'bot' && m.interactionId && (
                  <FeedbackLigne
                    feedback={m.feedback}
                    onNoter={(v) => noter(m.id, m.interactionId as string, v)}
                  />
                )}
              </div>
            ))}

            {reflexion && (
              <div className="flex justify-start">
                <div className="bg-white border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <span className="flex gap-1">
                    <Point delai="0ms" /><Point delai="150ms" /><Point delai="300ms" />
                  </span>
                </div>
              </div>
            )}

            <div ref={finRef} />
          </div>

          {/* Saisie */}
          <form
            onSubmit={(e) => { e.preventDefault(); envoyer(saisie) }}
            className="flex flex-col gap-1.5 border-t border-border bg-white px-3 py-2.5"
          >
            {erreurVocal && (
              <p className="text-xs text-red-600 px-1" role="status">
                {erreurVocal}
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={champRef}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                placeholder={transcription ? 'Transcription en cours...' : 'Posez votre question...'}
                className="flex-1 min-w-0 rounded-full bg-input-bg border border-border focus:border-primary focus:bg-input-focus outline-none px-4 py-2.5 text-sm"
                enterKeyHint="send"
              />
              {/* Dictée vocale : OGG via opus-recorder (repli webm), même endpoint de
                  transcription que la visite. Désactivée pendant la réflexion du bot. */}
              <VocalRecorderOgg
                onRecordingComplete={transcrire}
                onError={setErreurVocal}
                disabled={reflexion || transcription}
              />
              <button
                type="submit"
                disabled={!saisie.trim() || reflexion || transcription}
                aria-label="Envoyer"
                className="h-10 w-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center disabled:bg-gray-200 disabled:text-gray-400 enabled:hover:bg-primary-dark enabled:active:scale-95 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ---------- Sous-composants ----------

function Bulle({ role, children }: { role: 'user' | 'bot'; children: React.ReactNode }) {
  const estUser = role === 'user'
  return (
    <div className={`flex ${estUser ? 'justify-end' : 'justify-start'} animate-card-appear`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          estUser
            ? 'bg-primary text-white rounded-2xl rounded-br-md'
            : 'bg-white text-foreground border border-border rounded-2xl rounded-bl-md'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

// Ligne de feedback sous une réponse du bot : deux pouces avant notation, un petit
// remerciement après. Discret (texte gris, petits boutons) pour ne pas encombrer.
function FeedbackLigne({
  feedback,
  onNoter,
}: {
  feedback?: 1 | -1
  onNoter: (v: 1 | -1) => void
}) {
  if (feedback) {
    return (
      <p className="pl-1 text-[11px] text-gray-400">
        {feedback === 1 ? 'Merci, je m’en souviens 👍' : 'Noté, je ferai mieux la prochaine fois'}
      </p>
    )
  }
  return (
    <div className="flex items-center gap-1 pl-1">
      <span className="mr-0.5 text-[11px] text-gray-400">Cette réponse vous a aidé ?</span>
      <button
        type="button"
        onClick={() => onNoter(1)}
        aria-label="Réponse utile"
        className="p-1 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 active:scale-90 transition"
      >
        <IconePouce className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onNoter(-1)}
        aria-label="Réponse peu utile"
        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-90 transition"
      >
        <IconePouce className="h-3.5 w-3.5 rotate-180" />
      </button>
    </div>
  )
}

function IconePouce({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

function Point({ delai }: { delai: string }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-primary/60 animate-bounce"
      style={{ animationDelay: delai }}
    />
  )
}

function IconeBot({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  )
}
