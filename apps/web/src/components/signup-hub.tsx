"use client";
import { useState } from "react";
export function SignupHub() {
  const [selected, setSelected] = useState(false);
  return (
    <div className="signup-hub">
      <label>
        <input
          type="checkbox"
          name="startHub"
          value="yes"
          checked={selected}
          onChange={(event) => setSelected(event.target.checked)}
        />{" "}
        Start with a hub
      </label>
      <p className="verify-detail">A home for your collections. You can also create one later.</p>
      <div className="signup-hub-name">
        <label htmlFor="hub-name">Hub name</label>
        <input
          id="hub-name"
          name="hubName"
          maxLength={255}
          required={selected}
          aria-describedby="hub-name-help"
        />
        <p id="hub-name-help" className="verify-detail">
          For example, Engineering toolkit or My reading shelf.
        </p>
      </div>
    </div>
  );
}
