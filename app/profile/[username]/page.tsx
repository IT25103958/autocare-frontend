"use client";

import { useParams } from "next/navigation";
import ProfileView from "../_components/ProfileView";

// Someone else's profile, for administrators (opened from the Users page).
export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  return <ProfileView username={decodeURIComponent(username)} />;
}
