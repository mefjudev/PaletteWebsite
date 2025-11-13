import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email, projectName, inviterName, appUrl } = await request.json();

    if (!email || !projectName || !inviterName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('Resend API key not configured - invitation will be created but email will not be sent');
      // Return success with emailSent: false so the invitation is still created
      return NextResponse.json(
        { success: false, emailSent: false, message: 'Email service not configured' },
        { status: 200 }
      );
    }

    const signUpUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { data, error } = await resend.emails.send({
      from: 'Palette <onboarding@resend.dev>', // Using Resend's default domain for testing (no verification needed)
      to: email,
      subject: `You've been invited to view a project: ${projectName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #42504A;">You've been invited!</h2>
          <p>Hello,</p>
          <p><strong>${inviterName}</strong> has invited you to view their project: <strong>${projectName}</strong> on Palette.</p>
          <p>To access this project, please create an account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signUpUrl}" 
               style="display: inline-block; padding: 12px 24px; background-color: #42504A; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Create Account
            </a>
          </div>
          <p>Once you create an account with this email address, you'll automatically have access to view the project.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `
        You've been invited!
        
        ${inviterName} has invited you to view their project: ${projectName} on Palette.
        
        To access this project, please create an account at: ${signUpUrl}
        
        Once you create an account with this email address, you'll automatically have access to view the project.
      `,
    });

    if (error) {
      console.error('Resend API error:', JSON.stringify(error, null, 2));
      const errorMessage = error?.message || 'Unknown error';
      const errorDetails = typeof error === 'object' ? JSON.stringify(error) : String(error);
      return NextResponse.json(
        { 
          success: false, 
          emailSent: false, 
          error: 'Failed to send invitation email', 
          message: errorMessage,
          details: errorDetails
        },
        { status: 200 } // Return 200 so invitation is still considered created
      );
    }

    return NextResponse.json({ success: true, emailSent: true, messageId: data?.id });
  } catch (error) {
    console.error('Error in send-invitation API:', error);
    // Return 200 with emailSent: false so invitation is still considered created
    return NextResponse.json(
      { success: false, emailSent: false, error: 'Failed to send invitation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 200 }
    );
  }
}

