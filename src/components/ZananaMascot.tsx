import type { MascotPose } from '../domain/mascot'
import neutral from '../assets/zanana/zanana-neutral.png'
import uplifted from '../assets/zanana/zanana-uplifted.png'
import highHappy from '../assets/zanana/zanana-high-happy.png'
import settling from '../assets/zanana/zanana-settling.png'
import concerned from '../assets/zanana/zanana-concerned.png'

const poseAssets: Record<MascotPose, string> = {
  neutral,
  uplifted,
  'high-happy': highHappy,
  settling,
  concerned,
}

export function ZananaMascot({ pose, testId }: { pose: MascotPose; testId?: string }) {
  return <div className={`zanana-mascot pose-${pose}`} data-testid={testId} data-pose={pose} aria-hidden="true">
    <img key={pose} className="zanana-image" src={poseAssets[pose]} alt="" />
  </div>
}
