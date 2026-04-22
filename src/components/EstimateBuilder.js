import { useState } from "react";
import styles from "./EstimateBuilder.module.css";

export default function EstimateBuilder({ onSave, onSend }) {
  const [client, setClient] = useState("");
  const [job, setJob] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("EST-0001");
  const [taxPct, setTaxPct] = useState(0);
  const [lineItems, setLineItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");

  const handleAddItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }]);
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
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const tax = (subtotal * taxPct) / 100;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSave = () => {
    const summary = calculateSummary();
    onSave({ client, job, estimateNumber, taxPct, lineItems, notes, ...summary });
  };

  const handleSend = () => {
    const summary = calculateSummary();
    onSend({ client, job, estimateNumber, taxPct, lineItems, notes, ...summary });
  };

  const { subtotal, tax, total } = calculateSummary();

  return (
    <div className={styles.estimateBuilder}>
      <h1>Create Estimate</h1>
      <p>Create and send a professional estimate to your client</p>

      <label>
        Client
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Select or create a client"
        />
      </label>

      <label>
        Job
        <input
          type="text"
          value={job}
          onChange={(e) => setJob(e.target.value)}
          placeholder="Select or create a job"
        />
      </label>

      <label>
        Estimate Number
        <input
          type="text"
          value={estimateNumber}
          onChange={(e) => setEstimateNumber(e.target.value)}
          placeholder="Auto-generated"
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
              value={item.quantity}
              onChange={(e) => handleLineItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
              placeholder="Quantity"
            />
            <input
              type="number"
              value={item.unitPrice}
              onChange={(e) => handleLineItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)}
              placeholder="Unit Price"
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
          placeholder="Add project details, scope, or terms..."
        />
      </label>

      <div className={styles.summarySection}>
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        <p>Tax: ${tax.toFixed(2)}</p>
        <p>Total: ${total.toFixed(2)}</p>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={handleSave}>
          Save as Draft
        </button>
        <button type="button" onClick={handleSend}>
          Send to Client
        </button>
      </div>
    </div>
  );
}