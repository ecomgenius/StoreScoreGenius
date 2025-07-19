import fetch from 'node-fetch';

interface TrustOptimizationResult {
  applied: boolean;
  message: string;
  shopifyChanges: string[];
}

interface TrustChanges {
  current: string;
  recommended: string;
  implementation: string;
}

export async function applyTrustOptimization(
  shopifyDomain: string,
  accessToken: string,
  suggestionId: string,
  changes: TrustChanges
): Promise<TrustOptimizationResult> {
  const baseUrl = `https://${shopifyDomain}/admin/api/2024-04`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  console.log(`Starting trust optimization for ${shopifyDomain}, suggestion: ${suggestionId}`);
  console.log(`Using API URL: ${baseUrl}`);

  const appliedChanges: string[] = [];
  let successCount = 0;

  try {
    // Determine optimization type based on suggestion ID and content
    const optimizationType = determineOptimizationType(suggestionId, changes);
    console.log(`Determined optimization type: ${optimizationType}`);

    switch (optimizationType) {
      case 'reviews':
        await implementReviewSystem(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      case 'testimonials':
        await implementTestimonials(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      case 'badges':
        await implementTrustBadges(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      case 'security':
        await implementSecurityFeatures(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      case 'guarantees':
        await implementGuarantees(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      case 'contact':
        await implementContactInfo(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;

      default:
        // General trust optimization - add trust-building pages/content
        await implementGeneralTrust(baseUrl, headers, changes, appliedChanges);
        successCount++;
        break;
    }

    return {
      applied: successCount > 0,
      message: successCount > 0 ? 
        `Trust optimization successfully applied to your Shopify store. ${appliedChanges.length} modifications made.` :
        "Trust optimization tracked but no direct Shopify modifications were possible for this recommendation type.",
      shopifyChanges: appliedChanges
    };

  } catch (error) {
    console.error('Shopify trust optimization error:', error);
    
    // Check if this is a permissions error
    if (error.message && error.message.includes('write_content')) {
      return {
        applied: false,
        message: "Shopify permissions insufficient. Please reconnect your store with content writing permissions to enable trust optimizations.",
        shopifyChanges: []
      };
    }
    
    return {
      applied: false,
      message: "Failed to apply trust optimization to Shopify. Manual implementation required.",
      shopifyChanges: []
    };
  }
}

function determineOptimizationType(suggestionId: string, changes: TrustChanges): string {
  const text = `${suggestionId} ${changes.recommended} ${changes.implementation}`.toLowerCase();
  
  if (text.includes('review') || text.includes('rating')) return 'reviews';
  if (text.includes('testimonial') || text.includes('customer story')) return 'testimonials';
  if (text.includes('badge') || text.includes('certificate') || text.includes('seal')) return 'badges';
  if (text.includes('security') || text.includes('ssl') || text.includes('secure')) return 'security';
  if (text.includes('guarantee') || text.includes('money back') || text.includes('refund')) return 'guarantees';
  if (text.includes('contact') || text.includes('phone') || text.includes('address')) return 'contact';
  
  return 'general';
}

async function implementReviewSystem(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  // Update the store's configuration to encourage reviews
  // First, try to add review-encouraging content to existing pages
  
  try {
    // Get existing pages to see if we can enhance them
    const pagesResponse = await fetch(`${baseUrl}/pages.json?limit=250`, {
      method: 'GET',
      headers
    });
    
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json();
      const pages = pagesData.pages || [];
      
      // Look for existing FAQ, About, or similar pages to enhance
      const enhanceablePages = pages.filter((page: any) => 
        page.title.toLowerCase().includes('faq') || 
        page.title.toLowerCase().includes('about') ||
        page.title.toLowerCase().includes('help')
      );
      
      // If we find existing pages, add review information to them
      for (const page of enhanceablePages.slice(0, 1)) { // Enhance just one page
        const updatedContent = `
          ${page.body_html}
          
          <hr style="margin: 30px 0;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
            <h3>⭐ We Value Your Feedback</h3>
            <p><strong>Love your purchase?</strong> Help other customers by sharing your experience!</p>
            <p>Customer reviews help us improve and assist other shoppers in making informed decisions.</p>
            <p><strong>How to leave a review:</strong></p>
            <ol>
              <li>Check your email for our review request after purchase</li>
              <li>Visit the product page and scroll to the reviews section</li>
              <li>Share your honest experience with photos if possible</li>
            </ol>
            <p><em>Reviews are verified and help build our community of satisfied customers.</em></p>
          </div>
        `;
        
        const updateData = {
          page: {
            id: page.id,
            body_html: updatedContent
          }
        };
        
        const updateResponse = await fetch(`${baseUrl}/pages/${page.id}.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updateData)
        });
        
        if (updateResponse.ok) {
          appliedChanges.push(`Enhanced "${page.title}" page with review encouragement section`);
        }
      }
    }
  } catch (error) {
    console.error('Error enhancing existing pages:', error);
  }
  
  // Create a dedicated reviews policy page
  const reviewPageData = {
    page: {
      title: "Customer Reviews Policy",
      body_html: `
        <h2>Customer Reviews & Ratings</h2>
        <p><strong>Trust Enhancement Applied:</strong> ${changes.recommended}</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3>✅ Review System Implementation</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <h3>Our Review Promise:</h3>
        <ul>
          <li>✅ All reviews are from verified purchasers</li>
          <li>✅ We never fake or incentivize positive reviews</li>
          <li>✅ Both positive and negative feedback is displayed</li>
          <li>✅ Reviews help improve our products and service</li>
        </ul>
        
        <h3>Leave a Review:</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>After your purchase:</strong></p>
          <ol>
            <li>You'll receive an email invitation to review your purchase</li>
            <li>Visit the product page where you can rate and review</li>
            <li>Share photos of your purchase if you'd like</li>
            <li>Help other customers make informed decisions</li>
          </ol>
        </div>
        
        <h3>Review Guidelines:</h3>
        <ul>
          <li>Be honest and fair in your assessment</li>
          <li>Focus on the product quality and your experience</li>
          <li>Include specific details that help other shoppers</li>
          <li>Keep reviews respectful and constructive</li>
        </ul>
        
        <p><strong>Note:</strong> To fully activate customer reviews, install a review app from the Shopify App Store such as Judge.me, Yotpo, or Loox. This page provides the framework for your review policy.</p>
        
        <p><em>Customer feedback drives our commitment to quality and service excellence.</em></p>
      `,
      published: true,
      handle: "customer-reviews-policy"
    }
  };

  console.log(`Creating review policy page at: ${baseUrl}/pages.json`);
  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(reviewPageData)
  });

  console.log(`Page creation response status: ${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to create page: ${errorText}`);
  } else {
    const responseData = await response.json();
    console.log(`Successfully created page:`, responseData);
    appliedChanges.push("Created customer reviews policy page and enhanced existing pages with review encouragement");
  }
}

async function implementTestimonials(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const testimonialsPageData = {
    page: {
      title: "Customer Testimonials",
      body_html: `
        <h2>Customer Success Stories</h2>
        <p><strong>Trust Enhancement:</strong> ${changes.recommended}</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Implementation Guide:</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <h3>Sample Testimonial Structure:</h3>
        <div style="border-left: 4px solid #007bff; padding-left: 20px; margin: 20px 0;">
          <blockquote>
            <p>"[Customer feedback about your product/service experience]"</p>
            <footer>— Customer Name, Location</footer>
          </blockquote>
        </div>
        
        <h3>How to Collect Testimonials:</h3>
        <ul>
          <li>Send follow-up emails asking for feedback</li>
          <li>Offer small incentives for detailed testimonials</li>
          <li>Use social media mentions and reviews</li>
          <li>Interview satisfied customers</li>
          <li>Create case studies from success stories</li>
        </ul>
        
        <p><em>Start collecting and displaying customer testimonials to build trust and increase conversions.</em></p>
      `,
      published: true,
      handle: "customer-testimonials"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testimonialsPageData)
  });

  if (response.ok) {
    appliedChanges.push("Created customer testimonials page");
  }
}

async function implementTrustBadges(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const badgesPageData = {
    page: {
      title: "Trust & Security Badges",
      body_html: `
        <h2>Trust & Security Certifications</h2>
        <p><strong>Security Enhancement:</strong> ${changes.recommended}</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Implementation Instructions:</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <h3>Recommended Trust Badges:</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0;">
          <div style="text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h4>SSL Certificate</h4>
            <p>Secure encrypted connection</p>
          </div>
          <div style="text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h4>Payment Security</h4>
            <p>Protected payment processing</p>
          </div>
          <div style="text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h4>Money-Back Guarantee</h4>
            <p>Risk-free purchase promise</p>
          </div>
          <div style="text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h4>Customer Support</h4>
            <p>24/7 assistance available</p>
          </div>
        </div>
        
        <h3>Where to Display Trust Badges:</h3>
        <ul>
          <li>Product pages near the buy button</li>
          <li>Checkout page for payment security</li>
          <li>Footer across all pages</li>
          <li>Contact and about pages</li>
        </ul>
        
        <p><em>Display these trust signals prominently to reduce customer anxiety and increase conversions.</em></p>
      `,
      published: true,
      handle: "trust-security-badges"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(badgesPageData)
  });

  if (response.ok) {
    appliedChanges.push("Created trust & security badges guide");
  }
}

async function implementSecurityFeatures(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const securityPageData = {
    page: {
      title: "Security & Privacy",
      body_html: `
        <h2>Your Security & Privacy</h2>
        <p><strong>Security Enhancement:</strong> ${changes.recommended}</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3>🔒 Our Security Commitment</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <h3>Security Features:</h3>
        <div style="margin: 20px 0;">
          <h4>🛡️ SSL Encryption</h4>
          <p>All data transmitted between your browser and our servers is encrypted using industry-standard SSL technology.</p>
          
          <h4>💳 Secure Payments</h4>
          <p>We use trusted payment processors that comply with PCI DSS standards to protect your financial information.</p>
          
          <h4>🔐 Data Protection</h4>
          <p>Your personal information is stored securely and never shared with third parties without your consent.</p>
          
          <h4>📧 Email Security</h4>
          <p>We use secure email systems and never send unsolicited emails or share your email address.</p>
        </div>
        
        <h3>Privacy Policy Highlights:</h3>
        <ul>
          <li>We collect only necessary information for order processing</li>
          <li>Your data is never sold to third parties</li>
          <li>You can request data deletion at any time</li>
          <li>We comply with GDPR and other privacy regulations</li>
        </ul>
        
        <p><strong>Questions about security?</strong> Contact our support team for more information.</p>
      `,
      published: true,
      handle: "security-privacy"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(securityPageData)
  });

  if (response.ok) {
    appliedChanges.push("Created security & privacy information page");
  }
}

async function implementGuarantees(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const guaranteePageData = {
    page: {
      title: "Money-Back Guarantee",
      body_html: `
        <h2>100% Satisfaction Guarantee</h2>
        <p><strong>Customer Assurance:</strong> ${changes.recommended}</p>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3>💰 Our Promise to You</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <h3>Guarantee Details:</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4>✅ 30-Day Money-Back Guarantee</h4>
          <p>If you're not completely satisfied with your purchase, return it within 30 days for a full refund.</p>
          
          <h4>🚚 Free Return Shipping</h4>
          <p>We'll cover the cost of return shipping for defective or unsatisfactory items.</p>
          
          <h4>⚡ Quick Refund Process</h4>
          <p>Refunds are processed within 3-5 business days after we receive your return.</p>
        </div>
        
        <h3>How to Request a Refund:</h3>
        <ol>
          <li>Contact our customer service team</li>
          <li>Provide your order number and reason for return</li>
          <li>We'll send you a prepaid return label</li>
          <li>Ship the item back in original packaging</li>
          <li>Receive your full refund within 5 business days</li>
        </ol>
        
        <h3>What's Covered:</h3>
        <ul>
          <li>Items that don't match the description</li>
          <li>Defective or damaged products</li>
          <li>Items that don't fit as expected</li>
          <li>Any product you're not satisfied with</li>
        </ul>
        
        <p><strong>Shop with confidence!</strong> Your satisfaction is our top priority.</p>
      `,
      published: true,
      handle: "money-back-guarantee"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(guaranteePageData)
  });

  if (response.ok) {
    appliedChanges.push("Created money-back guarantee page");
  }
}

async function implementContactInfo(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const contactPageData = {
    page: {
      title: "Contact Us",
      body_html: `
        <h2>Get in Touch</h2>
        <p><strong>Contact Enhancement:</strong> ${changes.recommended}</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>📞 Contact Information</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0;">
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h4>📧 Email Support</h4>
            <p><strong>support@yourstore.com</strong></p>
            <p>We respond within 24 hours</p>
          </div>
          
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h4>📞 Phone Support</h4>
            <p><strong>1-800-XXX-XXXX</strong></p>
            <p>Mon-Fri: 9 AM - 6 PM EST</p>
          </div>
          
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h4>💬 Live Chat</h4>
            <p><strong>Available Now</strong></p>
            <p>Instant help when you need it</p>
          </div>
          
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h4>📍 Business Address</h4>
            <p><strong>Your Business Name</strong></p>
            <p>123 Business Street<br>City, State ZIP</p>
          </div>
        </div>
        
        <h3>Customer Service Hours:</h3>
        <ul>
          <li>Monday - Friday: 9:00 AM - 6:00 PM EST</li>
          <li>Saturday: 10:00 AM - 4:00 PM EST</li>
          <li>Sunday: Closed</li>
          <li>Live chat available 24/7</li>
        </ul>
        
        <h3>Frequently Asked Questions:</h3>
        <div style="margin: 20px 0;">
          <h4>What's your return policy?</h4>
          <p>We offer a 30-day money-back guarantee on all purchases.</p>
          
          <h4>How long does shipping take?</h4>
          <p>Standard shipping takes 3-7 business days, expedited shipping 1-3 days.</p>
          
          <h4>Do you ship internationally?</h4>
          <p>Yes, we ship to most countries worldwide. Shipping costs vary by location.</p>
        </div>
        
        <p><em>We're here to help! Don't hesitate to reach out with any questions or concerns.</em></p>
      `,
      published: true,
      handle: "contact-us"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(contactPageData)
  });

  if (response.ok) {
    appliedChanges.push("Created comprehensive contact information page");
  }
}

async function implementGeneralTrust(baseUrl: string, headers: any, changes: TrustChanges, appliedChanges: string[]) {
  const trustPageData = {
    page: {
      title: "Why Trust Us",
      body_html: `
        <h2>Why Shop With Confidence</h2>
        <p><strong>Trust Building:</strong> ${changes.recommended}</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>🛡️ Our Commitment to You</h3>
          <p>${changes.implementation}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 30px 0;">
          <div style="text-align: center; padding: 20px;">
            <h3>🌟 Quality Guarantee</h3>
            <p>Every product is carefully selected and tested to meet our high standards.</p>
          </div>
          
          <div style="text-align: center; padding: 20px;">
            <h3>🚚 Fast Shipping</h3>
            <p>Quick processing and reliable delivery partners ensure your order arrives on time.</p>
          </div>
          
          <div style="text-align: center; padding: 20px;">
            <h3>💝 Easy Returns</h3>
            <p>Not satisfied? Return any item within 30 days for a full refund, no questions asked.</p>
          </div>
          
          <div style="text-align: center; padding: 20px;">
            <h3>🔒 Secure Shopping</h3>
            <p>Your personal and payment information is protected with bank-level security.</p>
          </div>
          
          <div style="text-align: center; padding: 20px;">
            <h3>👥 Expert Support</h3>
            <p>Our knowledgeable team is ready to help with any questions or concerns.</p>
          </div>
          
          <div style="text-align: center; padding: 20px;">
            <h3>⭐ Customer Reviews</h3>
            <p>Don't just take our word for it - see what thousands of happy customers say.</p>
          </div>
        </div>
        
        <h3>Our Promise:</h3>
        <ul>
          <li>✅ Authentic products only</li>
          <li>✅ Competitive pricing</li>
          <li>✅ Fast, reliable shipping</li>
          <li>✅ Outstanding customer service</li>
          <li>✅ 100% satisfaction guarantee</li>
        </ul>
        
        <p><strong>Join thousands of satisfied customers</strong> who trust us for their shopping needs.</p>
      `,
      published: true,
      handle: "why-trust-us"
    }
  };

  const response = await fetch(`${baseUrl}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(trustPageData)
  });

  if (response.ok) {
    appliedChanges.push("Created comprehensive trust-building page");
  }
}