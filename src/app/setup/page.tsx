import {redirect} from 'next/navigation';
import {getDB} from '@/server/db';
import {setupPending} from '@/server/setup';
import {SetupWizard} from '@/components/setup-wizard';
export const dynamic='force-dynamic';
export default async function SetupPage(){
 if(!await setupPending(await getDB())) redirect('/login');
 return <SetupWizard/>;
}
