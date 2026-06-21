import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function findAdminUserByEmail(supabase: SupabaseClient, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        return null;
    }

    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
            throw error;
        }

        const match = data.users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail);
        if (match) {
            return match as User;
        }
        if (data.users.length < 200) {
            break;
        }
    }

    return null;
}
