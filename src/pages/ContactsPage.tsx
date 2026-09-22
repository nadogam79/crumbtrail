import { useState, type FormEvent } from 'react'
import { useTracking } from '../context/TrackingContext'

export function ContactsPage() {
  const { contacts, addContact, updateContact, removeContact } = useTracking()
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [phone, setPhone] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setRelation('')
    setPhone('')
    setEditingId(null)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return

    if (editingId) {
      updateContact({ id: editingId, name, relation, phone })
    } else {
      addContact({ name, relation, phone })
    }
    resetForm()
  }

  const startEdit = (id: string) => {
    const contact = contacts.find((c) => c.id === id)
    if (!contact) return
    setEditingId(id)
    setName(contact.name)
    setRelation(contact.relation)
    setPhone(contact.phone)
  }

  return (
    <div className="page">
      <section className="card">
        <h1>지인 관리</h1>
        <p>이상 신호가 감지됐을 때 알림을 받을 사람들이에요. 최소 1명 이상 등록해주세요.</p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>이름</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>관계</span>
              <input
                type="text"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder="가족, 친구 등"
              />
            </label>
          </div>
          <label className="field">
            <span>연락처</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <div className="field-row">
            <button type="submit" className="btn btn-primary">
              {editingId ? '수정 완료' : '지인 추가'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                취소
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>등록된 지인 ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <p>아직 등록된 지인이 없어요.</p>
        ) : (
          <ul className="contact-list">
            {contacts.map((c) => (
              <li key={c.id} className="contact-item">
                <div>
                  <strong>{c.name}</strong>
                  {c.relation && <span className="contact-relation"> · {c.relation}</span>}
                  <div className="contact-phone">{c.phone}</div>
                </div>
                <div className="contact-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => startEdit(c.id)}>
                    수정
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeContact(c.id)}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
