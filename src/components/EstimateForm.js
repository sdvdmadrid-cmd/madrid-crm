import { useState } from "react";
import styles from "./EstimateForm.module.css";

export default function EstimateForm({ onSubmit }) {
  const [client, setClient] = useState("");
  const [job, setJob] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [lineItems, setLineItems] = useState([{ description: "", amount: 0 }]);
  const [notes, setNotes] = useState("");

  const handleAddItem = () => {
    setLineItems([...lineItems, { description: "", amount: 0 }]);
  };

  const handleRemoveItem = (index) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index, field, value) => {
    const updatedItems = [...lineItems];
    updatedItems[index][field] = value;
    setLineItems(updatedItems);
  };

  const calculateSummary = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const tax = (subtotal * taxPct) / 100;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const summary = calculateSummary();
    onSubmit({ client, job, estimateNumber, taxPct, lineItems, notes, ...summary });
  };

  const { subtotal, tax, total } = calculateSummary();

  return (
    <form className={styles.estimateForm} onSubmit={handleSubmit}>
      <h2>Create Estimate</h2>

      <label>
        Client
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Select a client"
        />
      </label>

      <label>
        Job
        <input
          type="text"
          value={job}
          onChange={(e) => setJob(e.target.value)}
          placeholder="Select a job"
        />
      </label>

      <label>
        Estimate Number
        <input
          type="text"
          value={estimateNumber}
          onChange={(e) => setEstimateNumber(e.target.value)}
          placeholder="Enter estimate number"
        />
      </label>

      <label>
        Tax Percentage
        <input
          type="number"
          value={taxPct}
          onChange={(e) => setTaxPct(parseFloat(e.target.value) || 0)}
        />
      </label>

      <div className={styles.lineItemsSection}>
        <h3>Line Items</h3>
        {lineItems.map((item, index) => (
          <div key={index} className={styles.lineItemRow}>
            <input
              type="text"
              value={item.description}
              onChange={(e) => handleLineItemChange(index, "description", e.target.value)}
              placeholder="Description"
            />
            <input
              type="number"
              value={item.amount}
              onChange={(e) => handleLineItemChange(index, "amount", parseFloat(e.target.value) || 0)}
              placeholder="Amount"
            />
            <button type="button" onClick={() => handleRemoveItem(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={handleAddItem}>
          Add Item
        </button>
      </div>

      <label>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes"
        />
      </label>

      <div className={styles.summarySection}>
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        <p>Tax: ${tax.toFixed(2)}</p>
        <p>Total: ${total.toFixed(2)}</p>
      </div>

      <button type="submit">Create Estimate</button>
    </form>
  );
}