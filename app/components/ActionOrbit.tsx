import OrbitActionButton from "./OrbitActionButton";
import OrbitPosition from "./OrbitPosition";
import { ORBIT_POSITIONS, ORBIT_RADIUS } from "./orbitGeometry";
import { getQuickActionCatalog } from "../services/actionService";
import { getQuickActions } from "../services/actionCatalogService";
import type { Action, ActionType } from "../types/action";

type Props = {
  onAccion: (actionId: ActionType) => void | Promise<unknown>;
  disabled?: boolean;
  actions?: readonly Action[];
};

export default function ActionOrbit({
  onAccion,
  disabled = false,
  actions,
}: Props) {
  const quickActions = actions ? getQuickActions(actions) : getQuickActionCatalog();

  return (
    <>
      {quickActions
        .map((action, index) => {
          const position = ORBIT_POSITIONS[index];

          return (
          <OrbitPosition
            key={action.id}
            angle={position.angle}
            radius={ORBIT_RADIUS}
            placement={position.placement}
          >
            <OrbitActionButton
              icon={action.icon}
              iconId={action.iconId}
              title={action.title}
              points={action.points}
              placement={position.placement}
              onClick={() => onAccion(action.id)}
              disabled={disabled}
            />
          </OrbitPosition>
          );
        })}
    </>
  );
}
