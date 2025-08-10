import { useState } from 'react';
import { supabase } from '../supabase';

export default function ClientForm({ onClientAdded }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from('clients')
      .insert([{ full_name: name, phone }])


    if (error) {
      alert('Error adding client: ' + error.message);
    } else {
      setName('');
      setPhone('');
      onClientAdded(); // refresh the list
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-4 border rounded">
      <input
        className="w-full p-2 border"
        placeholder="Client name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="w-full p-2 border"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
        Add Client
      </button>
    </form>
  );
}
