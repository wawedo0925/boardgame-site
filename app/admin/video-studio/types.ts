export type SceneType = "진행자 실사" | "만화 컷씬" | "자료 화면";
export type SceneStatus = "아이디어" | "대본 완료" | "촬영 준비" | "촬영 완료";
export type StudioScene = { id:string; project_id:string; position:number; title:string; scene_type:SceneType; start_seconds:number; end_seconds:number; script:string; narration:boolean; image_url:string|null; image_prompt:string; edit_note:string; status:SceneStatus; is_short:boolean; short_title:string|null };
export type StudioRecording = { id:string; project_id:string; label:string; file_name:string; storage_path:string; mime_type:string; size_bytes:number; duration_seconds:number|null; orientation:"가로"|"세로"|"기타"; notes:string; created_at:string };
export type StudioEditJob = { id:string; project_id:string; status:"촬영본 대기"|"편집 요청"|"편집 중"|"검수 대기"|"완료"; brief:string; formats:string[]; captions:boolean; broll:boolean; output_path:string|null; updated_at:string };
export type StudioProject = { id:string; title:string; style:string; target_duration:number; thumbnail_url:string|null; updated_at:string; scenes:StudioScene[]; recordings:StudioRecording[]; edit_job:StudioEditJob|null };
