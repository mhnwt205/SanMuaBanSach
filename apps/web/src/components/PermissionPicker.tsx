import { Checkbox } from 'antd';
import { hasPermission, type User } from '../lib/types';

type Group = { key: string; name: string; actions: Record<string,string> };
/** Form owns the value; a click never silently selects a second permission. */
export function PermissionPicker({value=[],onChange,groups,user,disabled=false}:{value?:string[];onChange?:(value:string[])=>void;groups:Group[];user:User|null;disabled?:boolean}) {
  return <div className="cms-permission-groups">
    <p className="field-note">Có thể chọn nhiều quyền. Bấm từng ô để chọn, bấm lại để bỏ chọn. Quyền xem danh sách được cấp riêng.</p>
    {groups.map(group => {
      const selected=value.filter(key=>key.startsWith(group.key+'.')).length;
      return <section key={group.key} aria-label={`Quyền ${group.name}`}>
        <div className="cms-permission-heading"><h3>{group.name}</h3><span>{selected} / {Object.keys(group.actions).length} quyền</span></div>
        <div className="cms-permission-options">
          {Object.entries(group.actions).map(([action,label]) => {
            const key=group.key+'.'+action;
            return <Checkbox key={key} checked={value.includes(key)} disabled={disabled || !hasPermission(user,key)}
              onChange={event => onChange?.(event.target.checked ? [...new Set([...value,key])] : value.filter(item=>item!==key))}>{label}</Checkbox>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
