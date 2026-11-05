"use client";

import { useState } from "react";

export function MerchantStoreFields() {
  const [stores, setStores] = useState([0]);
  const [nextId, setNextId] = useState(1);
  return (
    <>
      {stores.map((id, index) => (
        <fieldset key={id} style={{ margin: "1rem 0" }}>
          <legend>Store {index + 1}</legend>
          <label htmlFor={`provider-${id}`}>Provider</label>
          <select id={`provider-${id}`} name="provider" defaultValue="lemonsqueezy">
            <option value="lemonsqueezy">Lemon Squeezy</option>
            <option value="paddle">Paddle</option>
          </select>
          <label htmlFor={`storeKey-${id}`}>Store API key</label>
          <input id={`storeKey-${id}`} name="storeKey" type="password" autoComplete="off" required />
          <label htmlFor={`storeId-${id}`}>Lemon Squeezy store id</label>
          <input id={`storeId-${id}`} name="storeId" inputMode="numeric" autoComplete="off" />
          <p className="muted">Required for Lemon Squeezy. Leave blank for Paddle. Each Lemon Squeezy entry covers one store, even if its key can access more.</p>
          <label htmlFor={`environment-${id}`}>Paddle environment</label>
          <select id={`environment-${id}`} name="environment" defaultValue="production">
            <option value="production">Production</option>
            <option value="sandbox">Sandbox</option>
          </select>
          <p className="muted">Only used for Paddle. The environment must match your key.</p>
          {stores.length > 1 ? <button type="button" onClick={() => setStores(stores.filter((store) => store !== id))}>Remove store</button> : null}
        </fieldset>
      ))}
      <button type="button" onClick={() => { setStores([...stores, nextId]); setNextId(nextId + 1); }}>Add another store (Team)</button>
    </>
  );
}
